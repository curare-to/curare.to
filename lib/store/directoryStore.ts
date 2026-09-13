'use client'

import { useSyncExternalStore } from 'react'
import type { Event } from 'nostr-tools/pure'
import type { SimplePool } from 'nostr-tools/pool'
import { pool as defaultPool } from '@/lib/nostr/pool'
import { READ_RELAYS } from '@/lib/nostr/relays'
import { CURATED_SCHEMA_KIND, type CuratedSchema } from '@/lib/protocol/curated'
import { newest, schemaFromEvent } from '@/lib/resolve/schema'

/* ------------------------------------------------------------------ *
 * The directory: every kind 31889 the directory relays hold, verified,
 * the newest per coordinate, and nothing more (decision 9). A paged scan —
 * {"kinds":[31889],"limit":100,"until":<oldest seen>} — with every result
 * through verifyEvent and parseCuratedSchemaEvent. What the page shows is
 * whatever anyone published; the viewer's mute list and a local hide keep
 * it usable, and a curated directory is future work.
 * ------------------------------------------------------------------ */

export interface DirectoryEntry {
  schema: CuratedSchema
  event: Event
  coordinate: string
}

export interface DirectorySnapshot {
  loading: boolean
  entries: DirectoryEntry[]
  /** True when the last page came back short — nothing older to fetch. */
  exhausted: boolean
  /**
   * Unusable schemas, and forged events handed in directly: counted, never
   * shown. (A forged event from a relay never arrives — nostr-tools checks
   * signatures on the way in.)
   */
  dropped: number
}

const PAGE = 100

export interface DirectoryStoreOptions {
  pool?: Pick<SimplePool, 'querySync'>
  relays?: readonly string[]
  pageSize?: number
}

export class DirectoryStore {
  private readonly pool: Pick<SimplePool, 'querySync'>
  private readonly relays: readonly string[]
  private readonly pageSize: number
  private entries = new Map<string, DirectoryEntry>()
  private oldest: number | null = null
  private exhausted = false
  private loading = false
  private dropped = 0
  private started = false
  private listeners = new Set<() => void>()
  private snapshot: DirectorySnapshot = { loading: true, entries: [], exhausted: false, dropped: 0 }

  constructor(options: DirectoryStoreOptions = {}) {
    this.pool = options.pool ?? defaultPool
    this.relays = options.relays ?? READ_RELAYS
    this.pageSize = options.pageSize ?? PAGE
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    if (!this.started) {
      this.started = true
      void this.loadMore()
    }
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): DirectorySnapshot => this.snapshot
  getServerSnapshot = (): DirectorySnapshot => ({ loading: true, entries: [], exhausted: false, dropped: 0 })

  /** The next page, older than everything seen. */
  loadMore = async (): Promise<void> => {
    if (this.loading || this.exhausted) return
    this.loading = true
    this.emit()
    let events: Event[] = []
    try {
      events = await this.pool.querySync([...this.relays], {
        kinds: [CURATED_SCHEMA_KIND],
        limit: this.pageSize,
        ...(this.oldest !== null ? { until: this.oldest - 1 } : {}),
      })
    } catch {
      events = []
    }
    for (const event of events) this.take(event)
    if (events.length > 0) {
      const min = Math.min(...events.map((e) => e.created_at))
      this.oldest = this.oldest === null ? min : Math.min(this.oldest, min)
    }
    // A short page is not proof of the end: nostr-tools drops forged events
    // before they arrive, so only an empty page says there is nothing older.
    if (events.length === 0) this.exhausted = true
    this.loading = false
    this.emit()
  }

  /** Verify and keep the newest per coordinate. */
  private take(event: Event): void {
    const resolved = schemaFromEvent(event)
    if (resolved.status !== 'ready') {
      this.dropped += 1
      return
    }
    const coordinate = `${CURATED_SCHEMA_KIND}:${event.pubkey}:${resolved.schema.identifier}`
    const current = this.entries.get(coordinate)
    if (current && newest([current.event, event]) !== event) return
    this.entries.set(coordinate, { schema: resolved.schema, event, coordinate })
  }

  /** A just-published schema, before the relay is asked again. */
  push(event: Event): void {
    this.take(event)
    this.emit()
  }

  private emit(): void {
    const entries = [...this.entries.values()].sort((a, b) => b.event.created_at - a.event.created_at || (a.event.id < b.event.id ? 1 : -1))
    this.snapshot = { loading: this.loading, entries, exhausted: this.exhausted, dropped: this.dropped }
    for (const listener of this.listeners) listener()
  }
}

export const directoryStore = new DirectoryStore()

export function useDirectory(): DirectorySnapshot {
  return useSyncExternalStore(directoryStore.subscribe, directoryStore.getSnapshot, directoryStore.getServerSnapshot)
}

/* ------------------------------ hidden ------------------------------ */

const HIDDEN_KEY = 'curare.to:hidden'

class HiddenStore {
  private hidden = new Set<string>()
  private loaded = false
  private listeners = new Set<() => void>()
  private snapshot: ReadonlySet<string> = new Set()

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    this.load()
    return () => {
      this.listeners.delete(listener)
    }
  }
  getSnapshot = (): ReadonlySet<string> => this.snapshot
  getServerSnapshot = (): ReadonlySet<string> => new Set()

  private load(): void {
    if (this.loaded || typeof window === 'undefined') return
    this.loaded = true
    try {
      const raw = window.localStorage.getItem(HIDDEN_KEY)
      if (raw) this.hidden = new Set(JSON.parse(raw))
    } catch {
      this.hidden = new Set()
    }
    this.emit()
  }

  toggle(coordinate: string): void {
    if (this.hidden.has(coordinate)) this.hidden.delete(coordinate)
    else this.hidden.add(coordinate)
    try {
      window.localStorage.setItem(HIDDEN_KEY, JSON.stringify([...this.hidden]))
    } catch {
      // storage unavailable; the choice holds for this page
    }
    this.emit()
  }

  private emit(): void {
    this.snapshot = new Set(this.hidden)
    for (const listener of this.listeners) listener()
  }
}

export const hiddenStore = new HiddenStore()

export function useHidden(): ReadonlySet<string> {
  return useSyncExternalStore(hiddenStore.subscribe, hiddenStore.getSnapshot, hiddenStore.getServerSnapshot)
}
