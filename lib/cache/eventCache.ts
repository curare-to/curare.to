import type { Event } from 'nostr-tools/pure'

/* ------------------------------------------------------------------ *
 * Events on this device: IndexedDB, keyed by scope and id, so that a
 * returning viewer renders a list from what it saw last time and asks the
 * relays only for what is newer. Every cached event is verified again on
 * the way out — the cache is a shortcut for the network, not for the
 * verifier. Where IndexedDB is missing (Node, a private window that
 * refuses it), the cache is a no-op and the site simply reads the relays.
 * ------------------------------------------------------------------ */

export interface EventCache {
  load(scope: string): Promise<Event[]>
  save(scope: string, events: Event[]): Promise<void>
  /** The newest created_at cached under a scope, or null. */
  newest(scope: string): Promise<number | null>
  clear(): Promise<void>
}

const DB = 'curare.to'
const STORE = 'events'
const VERSION = 1

interface Row {
  key: string
  scope: string
  id: string
  created_at: number
  event: Event
}

function open(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB, VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'key' })
        store.createIndex('scope', 'scope', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })

const result = <T,>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

export class IndexedDbCache implements EventCache {
  private db: Promise<IDBDatabase>
  constructor(factory: IDBFactory) {
    this.db = open(factory)
  }

  async load(scope: string): Promise<Event[]> {
    const db = await this.db
    const rows = await result(db.transaction(STORE, 'readonly').objectStore(STORE).index('scope').getAll(scope) as IDBRequest<Row[]>)
    return rows.map((r) => r.event)
  }

  async save(scope: string, events: Event[]): Promise<void> {
    if (events.length === 0) return
    const db = await this.db
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    for (const event of events) {
      const row: Row = { key: `${scope}|${event.id}`, scope, id: event.id, created_at: event.created_at, event }
      store.put(row)
    }
    await done(tx)
  }

  async newest(scope: string): Promise<number | null> {
    const events = await this.load(scope)
    return events.length === 0 ? null : Math.max(...events.map((e) => e.created_at))
  }

  async clear(): Promise<void> {
    const db = await this.db
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).clear()
    await done(tx)
  }
}

export class NoCache implements EventCache {
  async load(): Promise<Event[]> {
    return []
  }
  async save(): Promise<void> {}
  async newest(): Promise<number | null> {
    return null
  }
  async clear(): Promise<void> {}
}

let shared: EventCache | null = null

/** The device's cache — IndexedDB where there is one, a no-op elsewhere. Failures fall back to the no-op. */
export function eventCache(): EventCache {
  if (shared) return shared
  try {
    const factory = typeof indexedDB !== 'undefined' ? indexedDB : null
    shared = factory ? new IndexedDbCache(factory) : new NoCache()
  } catch {
    shared = new NoCache()
  }
  return shared
}

/** For tests: use a given factory, or reset. */
export function useEventCache(cache: EventCache | null): void {
  shared = cache
}

/** How far back the live subscription reaches behind the cache: clocks drift, and a deletion may be older. */
export const SINCE_OVERLAP_SECONDS = 3600
