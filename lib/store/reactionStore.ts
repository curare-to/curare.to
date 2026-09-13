'use client'

import { useMemo, useSyncExternalStore } from 'react'
import type { Event } from 'nostr-tools/pure'
import type { SimplePool } from 'nostr-tools/pool'
import { pool as defaultPool } from '@/lib/nostr/pool'
import { curatedSchemaAddress, type CuratedSchema } from '@/lib/protocol/curated'
import {
  parseReaction,
  parseZapReceipt,
  tally,
  REACTION_KIND,
  ZAP_RECEIPT_KIND,
  type Reaction,
  type Tally,
  type ZapReceipt,
} from '@/lib/protocol/reactions'

/* ------------------------------------------------------------------ *
 * Votes and zaps for whatever a page is looking at — posts (by their
 * groups' coordinates and ids) and comments (by id) — one store per sub,
 * subscribed to the sub's relays in chunks and re-tallied on demand with
 * the viewer's weighting. A vote the viewer just cast is pushed in before
 * the relay echoes it.
 * ------------------------------------------------------------------ */

const CHUNK = 60

export interface ReactionStoreOptions {
  pool?: Pick<SimplePool, 'subscribeMany'>
}

export class ReactionStore {
  readonly relays: string[]
  private readonly pool: Pick<SimplePool, 'subscribeMany'>
  private coordinates: string[] = []
  private ids: string[] = []
  private subs: { close(): void }[] = []
  private reactions = new Map<string, Reaction>()
  private receipts = new Map<string, ZapReceipt>()
  private listeners = new Set<() => void>()
  private version = 0
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private retimer: ReturnType<typeof setTimeout> | null = null

  constructor(relays: string[], options: ReactionStoreOptions = {}) {
    this.relays = relays
    this.pool = options.pool ?? defaultPool
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) this.close()
    }
  }

  /** A counter that changes whenever the data does; tallies are computed from it. */
  getSnapshot = (): number => this.version
  getServerSnapshot = (): number => 0

  /** Add targets to watch — coordinates and ids — reopening the subscriptions, debounced. */
  watch(coordinates: string[], ids: string[]): void {
    const nextC = [...new Set([...this.coordinates, ...coordinates])]
    const nextI = [...new Set([...this.ids, ...ids])]
    if (nextC.length === this.coordinates.length && nextI.length === this.ids.length) return
    this.coordinates = nextC
    this.ids = nextI
    if (this.retimer) clearTimeout(this.retimer)
    this.retimer = setTimeout(() => this.reopen(), 200)
  }

  pushEvent = (event: Event): void => {
    if (this.add(event)) this.scheduleFlush()
  }

  private add(event: Event): boolean {
    if (event.kind === REACTION_KIND) {
      const reaction = parseReaction(event)
      if (!reaction || this.reactions.has(reaction.id)) return false
      this.reactions.set(reaction.id, reaction)
      return true
    }
    if (event.kind === ZAP_RECEIPT_KIND) {
      const receipt = parseZapReceipt(event)
      if (!receipt || this.receipts.has(receipt.id)) return false
      this.receipts.set(receipt.id, receipt)
      return true
    }
    return false
  }

  private reopen(): void {
    this.close()
    const onevent = (event: Event) => {
      if (this.add(event)) this.scheduleFlush()
    }
    for (let i = 0; i < this.coordinates.length; i += CHUNK) {
      this.subs.push(
        this.pool.subscribeMany(this.relays, { kinds: [REACTION_KIND, ZAP_RECEIPT_KIND], '#a': this.coordinates.slice(i, i + CHUNK), limit: 2000 }, { onevent }),
      )
    }
    for (let i = 0; i < this.ids.length; i += CHUNK) {
      this.subs.push(
        this.pool.subscribeMany(this.relays, { kinds: [REACTION_KIND, ZAP_RECEIPT_KIND], '#e': this.ids.slice(i, i + CHUNK), limit: 2000 }, { onevent }),
      )
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
      this.version += 1
      for (const listener of this.listeners) listener()
    }, 120)
  }

  tally(targets: Iterable<string>, options: { weight?: (pubkey: string) => number; viewer?: string | null } = {}): Tally {
    return tally(this.reactions.values(), this.receipts.values(), targets, options)
  }
}

const stores = new Map<string, ReactionStore>()

export function getReactionStore(schema: CuratedSchema, relays: string[]): ReactionStore {
  const key = curatedSchemaAddress(schema) ?? schema.identifier
  let store = stores.get(key)
  if (!store) {
    store = new ReactionStore(relays)
    stores.set(key, store)
  }
  return store
}

/**
 * Watch a set of targets and get a tally function that recomputes whenever
 * votes arrive. `targets` is what the page shows: groups' coordinates and
 * ids, or comments' ids.
 */
export function useReactions(
  schema: CuratedSchema,
  relays: string[],
  targets: { coordinates: string[]; ids: string[] },
  weighting: { weight?: (pubkey: string) => number; viewer?: string | null },
): (target: Iterable<string>) => Tally {
  const store = getReactionStore(schema, relays)
  store.watch(targets.coordinates, targets.ids)
  const version = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot)
  return useMemo(
    () => (target: Iterable<string>) => store.tally(target, weighting),
    // version is the store's change counter — the function must change with it
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, version, weighting.weight, weighting.viewer],
  )
}
