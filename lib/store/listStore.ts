'use client'

import { useSyncExternalStore } from 'react'
import type { Event } from 'nostr-tools/pure'
import type { Filter } from 'nostr-tools/filter'
import type { SimplePool } from 'nostr-tools/pool'
import { pool as defaultPool } from '@/lib/nostr/pool'
import { READ_RELAYS } from '@/lib/nostr/relays'
import {
  CURATED_CANONICAL_KIND,
  CURATED_SUGGESTION_KIND,
  curatedSchemaAddress,
  verifyCuratedCanonical,
  verifyCuratedSuggestion,
  type CuratedSchema,
} from '@/lib/protocol/curated'
import { identifierOf, postGroups, type PostGroup, type Rejection } from '@/lib/protocol/group'
import { DELETION_KIND, deletedIds, LABEL_KIND, LABEL_NAMESPACE, parseRejection } from '@/lib/protocol/labels'

/* ------------------------------------------------------------------ *
 * One sub's events, live.
 *
 * This is bitcoin.mov's VideoStore with its two pins removed: a store is
 * made per schema coordinate rather than once for the site, and the schema
 * is handed in already resolved and verified rather than fetched from the
 * site's own well-known path. It subscribes to the relays the schema names
 * (the directory relays only when it names none — decision 5), keeps the
 * newest version per coordinate, verifies every event against the schema
 * and drops what fails — rejected, never repaired — and exposes the result
 * to React through useSyncExternalStore.
 *
 * Stores live in a module-level map keyed by coordinate so that two
 * components looking at the same sub share one subscription, and a store
 * nobody has looked at for a minute closes its relay subscriptions.
 * ------------------------------------------------------------------ */

export interface ListSnapshot {
  schema: CuratedSchema
  /** True until every relay has sent EOSE, or the timeout fired. */
  loading: boolean
  /** Verified suggestions, newest version per suggester and `d`, newest first. */
  suggestions: Event[]
  /** Verified canonical entries, newest version per `d`, newest first. */
  canonicals: Event[]
  /** The posts: decision 4's groups, newest head first. */
  groups: PostGroup[]
  /** Events that arrived and failed verification. Counted, never shown. */
  dropped: number
  /** Where this store is reading from. */
  relays: string[]
  /** The curator's standing rejections, by suggestion coordinate. */
  rejections: Rejection[]
  /** Every curator action seen, newest first: the audit trail the protocol already produces. */
  log: LogEntry[]
}

export interface LogEntry {
  id: string
  createdAt: number
  kind: 'curated' | 'rejected' | 'withdrew'
  /** The entry's `d` for a curation; the suggester's coordinate for a rejection; the label ids for a withdrawal. */
  subject: string
  detail: string
  pubkey: string
}

export interface ListStoreOptions {
  pool?: Pick<SimplePool, 'subscribeMany'>
  fallbackRelays?: readonly string[]
  /** Flip out of `loading` even if a relay never sends EOSE. */
  loadingTimeoutMs?: number
  /** How long a store with no subscribers keeps its relay subscriptions open. */
  idleCloseMs?: number
}

const byNewest = (a: Event, b: Event) => b.created_at - a.created_at || (a.id < b.id ? 1 : -1)

export class ListStore {
  readonly schema: CuratedSchema
  readonly relays: string[]
  private readonly pool: Pick<SimplePool, 'subscribeMany'>
  private readonly loadingTimeoutMs: number
  private readonly idleCloseMs: number

  private suggestions = new Map<string, Event>()
  private canonicals = new Map<string, Event>()
  private rejections = new Map<string, Rejection>()
  private deleted = new Set<string>()
  private log = new Map<string, LogEntry>()
  private dropped = 0
  private loading = true
  private listeners = new Set<() => void>()
  private subs: { close(): void }[] = []
  private open = false
  private pendingEose = 0
  private loadingTimer: ReturnType<typeof setTimeout> | null = null
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private snapshot: ListSnapshot
  private readonly serverSnapshot: ListSnapshot

  constructor(schema: CuratedSchema, options: ListStoreOptions = {}) {
    this.schema = schema
    this.pool = options.pool ?? defaultPool
    this.loadingTimeoutMs = options.loadingTimeoutMs ?? 6000
    this.idleCloseMs = options.idleCloseMs ?? 60_000
    const fallback = options.fallbackRelays ?? READ_RELAYS
    this.relays = schema.relays.length > 0 ? [...schema.relays] : [...fallback]
    this.snapshot = this.build()
    this.serverSnapshot = this.snapshot
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
    this.start()
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) {
        this.idleTimer = setTimeout(() => this.close(), this.idleCloseMs)
      }
    }
  }

  getSnapshot = (): ListSnapshot => this.snapshot

  /** Resolves once the first read is complete — for a check that must not race the relays. */
  whenLoaded = (): Promise<ListSnapshot> =>
    new Promise((resolve) => {
      if (!this.snapshot.loading) {
        resolve(this.snapshot)
        return
      }
      const unsubscribe = this.subscribe(() => {
        if (!this.snapshot.loading) {
          unsubscribe()
          resolve(this.snapshot)
        }
      })
    })

  getServerSnapshot = (): ListSnapshot => this.serverSnapshot

  /** Show a just-published event at once, before the relay echoes it back. */
  pushEvent = (event: Event): void => {
    const changed = event.kind === LABEL_KIND || event.kind === DELETION_KIND ? this.note(event) : this.upsert(event)
    if (changed) this.scheduleFlush()
  }

  /** Verify and store, keeping the newest version per coordinate. True when something changed. */
  private upsert(event: Event): boolean {
    const d = identifierOf(event)
    if (!d) return this.drop()

    if (event.kind === CURATED_SUGGESTION_KIND) {
      if (!verifyCuratedSuggestion(event, this.schema).ok) return this.drop()
      return this.keep(this.suggestions, `${event.pubkey}:${d}`, event)
    }
    if (event.kind === CURATED_CANONICAL_KIND) {
      if (!verifyCuratedCanonical(event, this.schema).ok) return this.drop()
      const title = event.tags.find((t) => t[0] === 'title')?.[1] ?? d
      this.record({ id: event.id, createdAt: event.created_at, kind: 'curated', subject: d, detail: title, pubkey: event.pubkey })
      // An older version still went in the log; only the newest is the entry.
      return this.keep(this.canonicals, d, event) || true
    }
    return this.drop()
  }

  private record(entry: LogEntry): void {
    if (!this.log.has(entry.id)) this.log.set(entry.id, entry)
  }

  /** The curator's labels and deletions: a rejection stands until curated after all, or deleted. */
  private note(event: Event): boolean {
    if (event.pubkey !== this.schema.namespace) return false
    if (event.kind === DELETION_KIND) {
      const ids = deletedIds(event)
      if (ids.length === 0) return false
      this.record({ id: event.id, createdAt: event.created_at, kind: 'withdrew', subject: ids.join(','), detail: event.content.trim(), pubkey: event.pubkey })
      for (const id of ids) {
        this.deleted.add(id)
        for (const [coordinate, rejection] of this.rejections) {
          if (rejection.id === id) this.rejections.delete(coordinate)
        }
      }
      return true
    }
    const rejection = parseRejection(event, this.schema.namespace)
    if (!rejection) return false
    this.record({ id: event.id, createdAt: event.created_at, kind: 'rejected', subject: rejection.coordinate, detail: rejection.reason, pubkey: event.pubkey })
    if (this.deleted.has(rejection.id)) return true
    const existing = this.rejections.get(rejection.coordinate)
    if (existing && existing.createdAt >= rejection.createdAt) return true
    this.rejections.set(rejection.coordinate, rejection)
    return true
  }

  private drop(): boolean {
    this.dropped += 1
    return true
  }

  private keep(map: Map<string, Event>, key: string, event: Event): boolean {
    const existing = map.get(key)
    if (existing && byNewest(existing, event) <= 0) return false
    map.set(key, event)
    return true
  }

  private start(): void {
    if (this.open) return
    this.open = true
    this.loading = true
    this.scheduleFlush()

    const address = curatedSchemaAddress(this.schema)
    if (!address) {
      this.finishLoading()
      return
    }

    // Relays can be flaky and never send EOSE — flip out of loading regardless.
    this.loadingTimer = setTimeout(() => this.finishLoading(), this.loadingTimeoutMs)

    // The NIP's two queries: everything anyone suggested in reply to this
    // schema's coordinate, and the canonical entries this curator signed. The
    // verifier enforces the author rule too; `authors` spares the relay.
    const filters: Filter[] = [
      { kinds: [CURATED_SUGGESTION_KIND], '#a': [address], limit: 500 },
      { kinds: [CURATED_CANONICAL_KIND], authors: [this.schema.namespace], '#a': [address], limit: 500 },
      // The curator's rejections, and the deletions that undo them.
      { kinds: [LABEL_KIND], authors: [this.schema.namespace], '#L': [LABEL_NAMESPACE], limit: 500 },
      { kinds: [DELETION_KIND], authors: [this.schema.namespace], '#k': [String(LABEL_KIND)], limit: 500 },
    ]
    this.pendingEose = filters.length
    this.subs = filters.map((filter) =>
      this.pool.subscribeMany(this.relays, filter, {
        onevent: (event) => {
          const changed = event.kind === LABEL_KIND || event.kind === DELETION_KIND ? this.note(event) : this.upsert(event)
          if (changed) this.scheduleFlush()
        },
        oneose: () => {
          this.pendingEose -= 1
          if (this.pendingEose <= 0) this.finishLoading()
        },
      }),
    )
  }

  /** Drop the relay subscriptions; the events stay, and a new subscriber reopens. */
  close(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
    if (!this.open) return
    this.open = false
    for (const sub of this.subs) sub.close()
    this.subs = []
    if (this.loadingTimer) {
      clearTimeout(this.loadingTimer)
      this.loadingTimer = null
    }
  }

  private finishLoading(): void {
    if (!this.loading) return
    this.loading = false
    if (this.loadingTimer) {
      clearTimeout(this.loadingTimer)
      this.loadingTimer = null
    }
    this.flush()
  }

  /** Coalesce bursts of incoming events into one rebuild and notify. */
  private scheduleFlush(): void {
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.flush()
    }, 150)
  }

  private flush(): void {
    this.snapshot = this.build()
    for (const listener of this.listeners) listener()
  }

  private build(): ListSnapshot {
    const suggestions = [...this.suggestions.values()].sort(byNewest)
    const canonicals = [...this.canonicals.values()].sort(byNewest)
    const rejections = [...this.rejections.values()]
    const log = [...this.log.values()].sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1))
    return {
      schema: this.schema,
      loading: this.loading,
      suggestions,
      canonicals,
      groups: postGroups(this.schema, { suggestions, canonicals, rejections }),
      dropped: this.dropped,
      relays: this.relays,
      rejections,
      log,
    }
  }
}

/* --------------------------- the registry --------------------------- */

const stores = new Map<string, ListStore>()

/** One store per schema coordinate for the life of the page. */
export function getListStore(schema: CuratedSchema, options?: ListStoreOptions): ListStore {
  const key = curatedSchemaAddress(schema) ?? `unpublished:${schema.identifier}`
  let store = stores.get(key)
  // A newer revision of the schema replaces the store; the old subscriptions close.
  if (store && store.schema.source?.id !== schema.source?.id) {
    store.close()
    stores.delete(key)
    store = undefined
  }
  if (!store) {
    store = new ListStore(schema, options)
    stores.set(key, store)
  }
  return store
}

/** A sub's live snapshot, for components. Shares one subscription per sub. */
export function useList(schema: CuratedSchema): ListSnapshot {
  const store = getListStore(schema)
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot)
}
