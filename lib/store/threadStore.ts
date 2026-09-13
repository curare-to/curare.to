'use client'

import { useSyncExternalStore } from 'react'
import type { Event } from 'nostr-tools/pure'
import type { SimplePool } from 'nostr-tools/pool'
import { pool as defaultPool } from '@/lib/nostr/pool'
import { supportsNip } from '@/lib/nostr/relayInfo'
import { buildThread, countNodes, parseComment, type Comment, type CommentNode } from '@/lib/protocol/comments'
import type { PostGroup } from '@/lib/protocol/group'
import type { CuratedSchema } from '@/lib/protocol/curated'
import { curatedSchemaAddress } from '@/lib/protocol/curated'

/* ------------------------------------------------------------------ *
 * A post's thread, live: every kind 1111 whose root is any coordinate in
 * the post's group, read from the sub's relays and merged into one tree.
 * One store per post, keyed by the group's first coordinate — the
 * canonical address, which exists from the moment the post is suggested —
 * and rebuilt when the group gains a coordinate (a new version arrived).
 *
 * The same shape, wider, gives the front page its counts: a per-sub store
 * subscribed to every visible group's coordinates in chunks, counting by
 * root. Phase 9's NIP-45 COUNT replaces that on relays that support it.
 * ------------------------------------------------------------------ */

export interface ThreadSnapshot {
  loading: boolean
  comments: Comment[]
  tree: CommentNode[]
  count: number
}

const EMPTY: ThreadSnapshot = { loading: true, comments: [], tree: [], count: 0 }

export interface ThreadStoreOptions {
  pool?: Pick<SimplePool, 'subscribeMany'>
  loadingTimeoutMs?: number
}

export class ThreadStore {
  readonly key: string
  readonly relays: string[]
  private coordinates: string[]
  private readonly pool: Pick<SimplePool, 'subscribeMany'>
  private readonly loadingTimeoutMs: number
  private comments = new Map<string, Comment>()
  private listeners = new Set<() => void>()
  private sub: { close(): void } | null = null
  private loading = true
  private loadingTimer: ReturnType<typeof setTimeout> | null = null
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private snapshot: ThreadSnapshot = EMPTY

  constructor(key: string, coordinates: string[], relays: string[], options: ThreadStoreOptions = {}) {
    this.key = key
    this.coordinates = coordinates
    this.relays = relays
    this.pool = options.pool ?? defaultPool
    this.loadingTimeoutMs = options.loadingTimeoutMs ?? 6000
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    this.open()
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) this.close()
    }
  }

  getSnapshot = (): ThreadSnapshot => this.snapshot
  getServerSnapshot = (): ThreadSnapshot => EMPTY

  /** Widen to a group that gained a coordinate; reopens the subscription. */
  setCoordinates(coordinates: string[]): void {
    if (coordinates.join('\n') === this.coordinates.join('\n')) return
    this.coordinates = coordinates
    if (this.sub) {
      this.close()
      this.open()
    }
  }

  /** Show a just-published comment before the relay echoes it. */
  pushEvent = (event: Event): void => {
    if (this.add(event)) this.scheduleFlush()
  }

  private add(event: Event): boolean {
    const comment = parseComment(event)
    if (!comment || !this.coordinates.includes(comment.root)) return false
    if (this.comments.has(comment.id)) return false
    this.comments.set(comment.id, comment)
    return true
  }

  private open(): void {
    if (this.sub || this.coordinates.length === 0) return
    this.loading = true
    this.loadingTimer = setTimeout(() => this.finishLoading(), this.loadingTimeoutMs)
    this.sub = this.pool.subscribeMany(
      this.relays,
      { kinds: [1111], '#A': this.coordinates, limit: 500 },
      {
        onevent: (event) => {
          if (this.add(event)) this.scheduleFlush()
        },
        oneose: () => this.finishLoading(),
      },
    )
  }

  close(): void {
    this.sub?.close()
    this.sub = null
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

  private scheduleFlush(): void {
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.flush()
    }, 120)
  }

  private flush(): void {
    const comments = [...this.comments.values()]
    const tree = buildThread(comments)
    this.snapshot = { loading: this.loading, comments, tree, count: countNodes(tree) }
    for (const listener of this.listeners) listener()
  }
}

/** The thread reordered — "best" by the Wilson bound of each comment's votes — without refetching. */
export function orderThread(comments: Comment[], order: (a: CommentNode, b: CommentNode) => number): CommentNode[] {
  return buildThread(comments, order)
}

const threads = new Map<string, ThreadStore>()

export function getThreadStore(schema: CuratedSchema, group: PostGroup, relays: string[]): ThreadStore {
  const key = `${curatedSchemaAddress(schema)}|${group.coordinates[0]}`
  let store = threads.get(key)
  if (!store) {
    store = new ThreadStore(key, group.coordinates, relays)
    threads.set(key, store)
  } else {
    store.setCoordinates(group.coordinates)
  }
  return store
}

export function useThread(schema: CuratedSchema, group: PostGroup, relays: string[]): ThreadSnapshot {
  const store = getThreadStore(schema, group, relays)
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot)
}

/* --------------------------- the counts ---------------------------- */

const CHUNK = 60

export interface CountStoreOptions extends ThreadStoreOptions {
  pool?: Pick<SimplePool, 'subscribeMany' | 'ensureRelay'>
  /** Which relays answer COUNT (NIP-45); asked of NIP-11 by default. */
  countsOn?: (relay: string) => Promise<boolean>
}

export class CommentCountStore {
  private readonly pool: Pick<SimplePool, 'subscribeMany' | 'ensureRelay'>
  private readonly relays: string[]
  private readonly countsOn: (relay: string) => Promise<boolean>
  private coordinates: string[] = []
  private subs: { close(): void }[] = []
  private roots = new Map<string, Set<string>>() // root coordinate → comment ids
  private counted = new Map<string, number>() // root coordinate → NIP-45 answer
  private asked = new Set<string>()
  private listeners = new Set<() => void>()
  private snapshot: Map<string, number> = new Map()
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private retimer: ReturnType<typeof setTimeout> | null = null

  constructor(relays: string[], options: CountStoreOptions = {}) {
    this.relays = relays
    this.pool = options.pool ?? defaultPool
    this.countsOn = options.countsOn ?? ((relay) => supportsNip(relay, 45))
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) this.close()
    }
  }

  getSnapshot = (): Map<string, number> => this.snapshot
  getServerSnapshot = (): Map<string, number> => new Map()

  /** The coordinates to count for — the visible groups', debounced, chunked. */
  watch(coordinates: string[]): void {
    const next = [...new Set(coordinates)]
    if (next.join('\n') === this.coordinates.join('\n')) return
    this.coordinates = next
    if (this.retimer) clearTimeout(this.retimer)
    this.retimer = setTimeout(() => this.reopen(), 200)
  }

  private reopen(): void {
    this.close()
    void this.countWhereAdvertised()
    for (let i = 0; i < this.coordinates.length; i += CHUNK) {
      const chunk = this.coordinates.slice(i, i + CHUNK)
      this.subs.push(
        this.pool.subscribeMany(this.relays, { kinds: [1111], '#A': chunk, limit: 1000 }, {
          onevent: (event) => {
            const comment = parseComment(event)
            if (!comment) return
            let ids = this.roots.get(comment.root)
            if (!ids) {
              ids = new Set()
              this.roots.set(comment.root, ids)
            }
            if (!ids.has(comment.id)) {
              ids.add(comment.id)
              this.scheduleFlush()
            }
          },
        }),
      )
    }
  }

  /**
   * NIP-45: one COUNT per coordinate on the relays that advertise it, asked
   * once each. A count from a relay is taken over what the subscription has
   * gathered when it is larger — the relay knows what it holds; the
   * subscription only what it has sent so far.
   */
  private async countWhereAdvertised(): Promise<void> {
    const relays: string[] = []
    for (const relay of this.relays) {
      try {
        if (await this.countsOn(relay)) relays.push(relay)
      } catch {
        // an unreachable relay counts nothing
      }
    }
    if (relays.length === 0) return
    for (const coordinate of this.coordinates) {
      if (this.asked.has(coordinate)) continue
      this.asked.add(coordinate)
      let best = -1
      for (const url of relays) {
        try {
          const relay = await this.pool.ensureRelay(url, { connectionTimeout: 4000 })
          const count = await relay.count([{ kinds: [1111], '#A': [coordinate] }], {})
          best = Math.max(best, count)
        } catch {
          // this relay's count is unknown; the subscription's stands
        }
      }
      if (best >= 0) {
        this.counted.set(coordinate, best)
        this.scheduleFlush()
      }
    }
  }

  close(): void {
    for (const sub of this.subs) sub.close()
    this.subs = []
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      const merged = new Map<string, number>()
      for (const [root, ids] of this.roots) merged.set(root, ids.size)
      for (const [root, count] of this.counted) merged.set(root, Math.max(count, merged.get(root) ?? 0))
      this.snapshot = merged
      for (const listener of this.listeners) listener()
    }, 150)
  }
}

const counters = new Map<string, CommentCountStore>()

/** Comment counts per group, for a page of groups: a group's count is the sum over its coordinates. */
export function useCommentCounts(schema: CuratedSchema, groups: PostGroup[], relays: string[]): (group: PostGroup) => number {
  const key = curatedSchemaAddress(schema) ?? schema.identifier
  let store = counters.get(key)
  if (!store) {
    store = new CommentCountStore(relays)
    counters.set(key, store)
  }
  store.watch(groups.flatMap((g) => g.coordinates))
  const counts = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot)
  return (group) => group.coordinates.reduce((n, c) => n + (counts.get(c) ?? 0), 0)
}
