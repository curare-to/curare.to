'use client'

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { CuratedSchema } from '@/lib/protocol/curated'
import { curatedSchemaAddress } from '@/lib/protocol/curated'
import type { PostGroup } from '@/lib/protocol/group'
import type { Tally } from '@/lib/protocol/reactions'
import { compareBy, type SortKey } from '@/lib/rank/hot'
import { shownScore, type VoteMode } from '@/lib/rank/wot'
import { getListStore, type ListStore } from './listStore'
import { getReactionStore, type ReactionStore } from './reactionStore'

/* ------------------------------------------------------------------ *
 * The home feed: the union of several subs' front pages, ranked by the
 * viewer's sort from the votes this page fetched. Each sub's store is the
 * Phase 1 store; the feed opens the first page of each and merges.
 * ------------------------------------------------------------------ */

export interface FeedItem {
  schema: CuratedSchema
  group: PostGroup
  tally: Tally
  relays: string[]
  id: string
  createdAt: number
  score: number
  sats: number
}

export interface FeedSnapshot {
  loading: boolean
  items: FeedItem[]
}

const PER_SUB = 30

export class FeedStore {
  private schemas: CuratedSchema[] = []
  private stores = new Map<string, { list: ListStore; reactions: ReactionStore; unsubscribe: () => void }>()
  private listeners = new Set<() => void>()
  private snapshot: FeedSnapshot = { loading: true, items: [] }
  private weight: (pubkey: string) => number = () => 1
  private viewer: string | null = null
  private mode: VoteMode = 'everyone'
  private sort: SortKey = 'hot'
  private flushTimer: ReturnType<typeof setTimeout> | null = null

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) this.detachAll()
    }
  }

  getSnapshot = (): FeedSnapshot => this.snapshot
  getServerSnapshot = (): FeedSnapshot => ({ loading: true, items: [] })

  configure(options: { weight: (pubkey: string) => number; viewer: string | null; mode: VoteMode; sort: SortKey }): void {
    this.weight = options.weight
    this.viewer = options.viewer
    this.mode = options.mode
    this.sort = options.sort
    this.scheduleFlush()
  }

  setSchemas(schemas: CuratedSchema[]): void {
    const keys = new Set(schemas.map((s) => curatedSchemaAddress(s) ?? s.identifier))
    for (const [key, entry] of this.stores) {
      if (!keys.has(key)) {
        entry.unsubscribe()
        this.stores.delete(key)
      }
    }
    this.schemas = schemas
    for (const schema of schemas) {
      const key = curatedSchemaAddress(schema) ?? schema.identifier
      if (this.stores.has(key)) continue
      const list = getListStore(schema)
      const reactions = getReactionStore(schema, list.relays)
      const a = list.subscribe(() => this.scheduleFlush())
      const b = reactions.subscribe(() => this.scheduleFlush())
      this.stores.set(key, { list, reactions, unsubscribe: () => (a(), b()) })
    }
    this.scheduleFlush()
  }

  private detachAll(): void {
    for (const entry of this.stores.values()) entry.unsubscribe()
    this.stores.clear()
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.flush()
    }, 120)
  }

  private flush(): void {
    const items: FeedItem[] = []
    let loading = false
    for (const schema of this.schemas) {
      const entry = this.stores.get(curatedSchemaAddress(schema) ?? schema.identifier)
      if (!entry) continue
      const snapshot = entry.list.getSnapshot()
      if (snapshot.loading) loading = true
      const groups = snapshot.groups.filter((g) => g.state === 'curated').slice(0, PER_SUB)
      entry.reactions.watch(groups.flatMap((g) => g.coordinates), groups.flatMap((g) => g.ids))
      for (const group of groups) {
        const tally = entry.reactions.tally([...group.coordinates, ...group.ids], { weight: this.weight, viewer: this.viewer })
        items.push({
          schema,
          group,
          tally,
          relays: snapshot.relays,
          id: group.head.id,
          createdAt: group.head.created_at,
          score: shownScore(tally, this.mode),
          sats: tally.sats,
        })
      }
    }
    items.sort(compareBy(this.sort))
    this.snapshot = { loading, items }
    for (const listener of this.listeners) listener()
  }
}

const feeds = new Map<string, FeedStore>()

/** A merged feed over `schemas`, keyed so that two pages share one. */
export function useFeed(
  key: string,
  schemas: CuratedSchema[],
  options: { weight: (pubkey: string) => number; viewer: string | null; mode: VoteMode; sort: SortKey },
): FeedSnapshot {
  const store = useMemo(() => {
    let s = feeds.get(key)
    if (!s) {
      s = new FeedStore()
      feeds.set(key, s)
    }
    return s
  }, [key])
  useEffect(() => {
    store.configure(options)
  }, [store, options])
  useEffect(() => {
    store.setSchemas(schemas)
  }, [store, schemas])
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot)
}
