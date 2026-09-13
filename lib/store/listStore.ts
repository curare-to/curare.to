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
import { identifierOf, postGroups, type PostGroup } from '@/lib/protocol/group'

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

  getServerSnapshot = (): ListSnapshot => this.serverSnapshot

  /** Show a just-published event at once, before the relay echoes it back. */
  pushEvent = (event: Event): void => {
    if (this.upsert(event)) this.scheduleFlush()
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
      return this.keep(this.canonicals, d, event)
    }
    return this.drop()
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
    ]
    this.pendingEose = filters.length
    this.subs = filters.map((filter) =>
      this.pool.subscribeMany(this.relays, filter, {
        onevent: (event) => {
          if (this.upsert(event)) this.scheduleFlush()
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
    return {
      schema: this.schema,
      loading: this.loading,
      suggestions,
      canonicals,
      groups: postGroups(this.schema, { suggestions, canonicals }),
      dropped: this.dropped,
      relays: this.relays,
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
