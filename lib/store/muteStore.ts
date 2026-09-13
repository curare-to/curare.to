'use client'

import { useSyncExternalStore } from 'react'
import type { Event } from 'nostr-tools/pure'
import { getNip07 } from '@/lib/nostr/nip07'
import { pool } from '@/lib/nostr/pool'
import { READ_RELAYS } from '@/lib/nostr/relays'
import { MUTE_KIND, NO_MUTES, parseMutes, type Mutes } from '@/lib/protocol/mutes'

/* Kind 10000 mute lists, one per pubkey, fetched once. The viewer's own
 * private items are opened through the extension's NIP-44 when it has one. */

class MuteStore {
  private mutes = new Map<string, Mutes | null>()
  private listeners = new Map<string, Set<() => void>>()
  private extraRelays = new Set<string>()
  /** Whose private items may be decrypted: the signed-in pubkey. */
  self: string | null = null

  addRelays(relays: readonly string[]): void {
    for (const r of relays) this.extraRelays.add(r)
  }

  get(pubkey: string): Mutes | null {
    if (!this.mutes.has(pubkey)) {
      this.mutes.set(pubkey, null)
      void this.load(pubkey)
    }
    return this.mutes.get(pubkey) ?? null
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

  /** Forget a pubkey's list so it is fetched again — after the viewer edits theirs. */
  refresh(pubkey: string): void {
    this.mutes.delete(pubkey)
    this.get(pubkey)
  }

  /** Show a just-published list at once. */
  async push(event: Event): Promise<void> {
    this.mutes.set(event.pubkey, await parseMutes(event, this.decryptFor(event.pubkey)))
    for (const listener of this.listeners.get(event.pubkey) ?? []) listener()
  }

  private decryptFor(pubkey: string) {
    const provider = getNip07()
    if (!provider?.nip44 || pubkey !== this.self) return null
    return (ciphertext: string) => provider.nip44!.decrypt(pubkey, ciphertext)
  }

  private async load(pubkey: string): Promise<void> {
    let events: Event[] = []
    try {
      events = await pool.querySync([...new Set([...READ_RELAYS, ...this.extraRelays])], { kinds: [MUTE_KIND], authors: [pubkey] })
    } catch {
      events = []
    }
    const latest = events.sort((a, b) => b.created_at - a.created_at || (a.id < b.id ? -1 : 1))[0]
    this.mutes.set(pubkey, latest ? await parseMutes(latest, this.decryptFor(pubkey)) : { ...NO_MUTES })
    for (const listener of this.listeners.get(pubkey) ?? []) listener()
  }
}

export const muteStore = new MuteStore()

/** A pubkey's mute list; nothing muted until known. */
export function useMutes(pubkey: string | null): Mutes {
  return useSyncExternalStore(
    (listener) => (pubkey ? muteStore.subscribe(pubkey, listener) : () => {}),
    () => (pubkey ? (muteStore.get(pubkey) ?? NO_MUTES) : NO_MUTES),
    () => NO_MUTES,
  )
}
