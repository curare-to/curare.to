'use client'

import { useSyncExternalStore } from 'react'
import type { Event } from 'nostr-tools/pure'
import { pool } from '@/lib/nostr/pool'
import { directoryRelays } from '@/lib/nostr/relays'
import { followsOf } from '@/lib/rank/wot'

/* Kind 3 follow lists, one per pubkey, fetched once and cached. `null` while unknown. */

class FollowStore {
  private follows = new Map<string, Set<string> | null>()
  private listeners = new Map<string, Set<() => void>>()
  private extraRelays = new Set<string>()

  addRelays(relays: readonly string[]): void {
    for (const r of relays) this.extraRelays.add(r)
  }

  get(pubkey: string): Set<string> | null {
    if (!this.follows.has(pubkey)) {
      this.follows.set(pubkey, null)
      void this.load(pubkey)
    }
    return this.follows.get(pubkey) ?? null
  }

  subscribe(pubkey: string, listener: () => void): () => void {
    let set = this.listeners.get(pubkey)
    if (!set) {
      set = new Set()
      this.listeners.set(pubkey, set)
    }
    set.add(listener)
    this.get(pubkey)
    return () => {
      set!.delete(listener)
    }
  }

  private async load(pubkey: string): Promise<void> {
    let events: Event[] = []
    try {
      events = await pool.querySync([...new Set([...directoryRelays(), ...this.extraRelays])], { kinds: [3], authors: [pubkey] })
    } catch {
      events = []
    }
    const newest = events.sort((a, b) => b.created_at - a.created_at || (a.id < b.id ? -1 : 1))[0]
    this.follows.set(pubkey, newest ? followsOf(newest) : new Set())
    for (const listener of this.listeners.get(pubkey) ?? []) listener()
  }
}

export const followStore = new FollowStore()

const EMPTY: Set<string> = new Set()

/** Who a pubkey follows; an empty set until known. */
export function useFollows(pubkey: string | null): Set<string> {
  return useSyncExternalStore(
    (listener) => (pubkey ? followStore.subscribe(pubkey, listener) : () => {}),
    () => (pubkey ? (followStore.get(pubkey) ?? EMPTY) : EMPTY),
    () => EMPTY,
  )
}
