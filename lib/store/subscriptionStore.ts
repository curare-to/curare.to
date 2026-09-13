'use client'

import { useSyncExternalStore } from 'react'
import type { Event } from 'nostr-tools/pure'
import { getNip07, signAndPublish } from '@/lib/nostr/nip07'
import { pool } from '@/lib/nostr/pool'
import { READ_RELAYS } from '@/lib/nostr/relays'
import { buildSubscriptionsTemplate, parseSubscriptions, SUBSCRIPTIONS_KIND, type Subscription } from '@/lib/protocol/subscriptions'
import { sessionStore } from './session'

/* ------------------------------------------------------------------ *
 * The viewer's subscriptions: their kind 10889, read from their write
 * relays and the directory relays, republished whole on every change.
 * Private items go through the extension's NIP-44, to oneself.
 * ------------------------------------------------------------------ */

export interface SubscriptionsSnapshot {
  status: 'idle' | 'loading' | 'ready'
  subscriptions: Subscription[]
  privateUnreadable: boolean
}

const EMPTY: SubscriptionsSnapshot = { status: 'idle', subscriptions: [], privateUnreadable: false }

class SubscriptionStore {
  private snapshot: SubscriptionsSnapshot = EMPTY
  private listeners = new Set<() => void>()
  private loadedFor: string | null = null
  private lastPublishedAt = 0

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    this.follow()
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): SubscriptionsSnapshot => this.snapshot
  getServerSnapshot = (): SubscriptionsSnapshot => EMPTY

  private following = false
  private follow(): void {
    if (this.following) return
    this.following = true
    const check = () => {
      const session = sessionStore.getSnapshot()
      if (session.status === 'signed-in' && session.pubkey !== this.loadedFor) void this.load(session.pubkey)
      if (session.status === 'signed-out' && this.loadedFor !== null) {
        this.loadedFor = null
        this.set(EMPTY)
      }
    }
    sessionStore.subscribe(check)
    check()
  }

  private relays(): string[] {
    const session = sessionStore.getSnapshot()
    return [...new Set([...READ_RELAYS, ...(session.writeRelays ?? [])])]
  }

  private crypto(pubkey: string) {
    const provider = getNip07()
    if (!provider?.nip44) return { encrypt: null, decrypt: null }
    return {
      encrypt: (plaintext: string) => provider.nip44!.encrypt(pubkey, plaintext),
      decrypt: (ciphertext: string) => provider.nip44!.decrypt(pubkey, ciphertext),
    }
  }

  private async load(pubkey: string): Promise<void> {
    this.loadedFor = pubkey
    this.set({ ...this.snapshot, status: 'loading' })
    let events: Event[] = []
    try {
      events = await pool.querySync(this.relays(), { kinds: [SUBSCRIPTIONS_KIND], authors: [pubkey] })
    } catch {
      events = []
    }
    const latest = events.sort((a, b) => b.created_at - a.created_at || (a.id < b.id ? -1 : 1))[0]
    if (this.loadedFor !== pubkey) return
    if (!latest) {
      this.set({ status: 'ready', subscriptions: [], privateUnreadable: false })
      return
    }
    const parsed = await parseSubscriptions(latest, this.crypto(pubkey).decrypt)
    this.set({ status: 'ready', ...parsed })
  }

  /** Republish the whole list with one change. Throws with a reason. */
  private async publish(next: Subscription[]): Promise<void> {
    const pubkey = sessionStore.getSnapshot().pubkey ?? (await sessionStore.signIn())
    if (!pubkey) throw new Error('Sign in to subscribe.')
    if (this.snapshot.privateUnreadable) {
      throw new Error('Your list has private items this extension cannot open; republishing would lose them.')
    }
    const createdAt = Math.max(Math.floor(Date.now() / 1000), this.lastPublishedAt + 1)
    const template = await buildSubscriptionsTemplate(next, this.crypto(pubkey).encrypt, createdAt)
    this.lastPublishedAt = createdAt
    const { signed } = await signAndPublish(template, this.relays())
    const parsed = await parseSubscriptions(signed, this.crypto(pubkey).decrypt)
    this.set({ status: 'ready', ...parsed })
  }

  subscribeTo = async (coordinate: string, relay: string, isPrivate = false): Promise<void> => {
    const rest = this.snapshot.subscriptions.filter((s) => s.coordinate !== coordinate)
    await this.publish([...rest, { coordinate, relay, private: isPrivate }])
  }

  unsubscribeFrom = async (coordinate: string): Promise<void> => {
    await this.publish(this.snapshot.subscriptions.filter((s) => s.coordinate !== coordinate))
  }

  private set(snapshot: SubscriptionsSnapshot): void {
    this.snapshot = snapshot
    for (const listener of this.listeners) listener()
  }
}

export const subscriptionStore = new SubscriptionStore()

export function useSubscriptions(): SubscriptionsSnapshot {
  return useSyncExternalStore(subscriptionStore.subscribe, subscriptionStore.getSnapshot, subscriptionStore.getServerSnapshot)
}
