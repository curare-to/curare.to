'use client'

import { useSyncExternalStore } from 'react'
import type { Event } from 'nostr-tools/pure'
import type { SimplePool } from 'nostr-tools/pool'
import { pool as defaultPool } from '@/lib/nostr/pool'
import { READ_RELAYS } from '@/lib/nostr/relays'
import { isSafeUrl } from '@/lib/protocol/curated'

/* ------------------------------------------------------------------ *
 * Kind 0 profiles, fetched in batches and cached for the page's life.
 *
 * Anything that shows a pubkey asks here; requests made in the same tick are
 * folded into one query per relay set. A profile is `null` until it arrives
 * and `Profile` with `found: false` when the relays had nothing, so a
 * component can tell "still asking" from "nobody by that name".
 * ------------------------------------------------------------------ */

export interface Profile {
  pubkey: string
  found: boolean
  name: string | null
  displayName: string | null
  about: string | null
  /** https only — it gets rendered. */
  picture: string | null
  nip05: string | null
  /** Set once the NIP-05 claim has been checked; null while unchecked. */
  nip05Verified: boolean | null
  createdAt: number
}

export interface ProfileStoreOptions {
  pool?: Pick<SimplePool, 'querySync'>
  relays?: readonly string[]
  fetch?: typeof fetch
  batchMs?: number
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

export function profileFromEvent(event: Event): Profile {
  let content: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(event.content)
    if (parsed && typeof parsed === 'object') content = parsed
  } catch {
    // an unparseable kind 0 is a profile with no fields
  }
  const picture = str(content.picture)
  return {
    pubkey: event.pubkey,
    found: true,
    name: str(content.name),
    displayName: str(content.display_name) ?? str(content.displayName),
    about: str(content.about),
    picture: picture && isSafeUrl(picture, true) ? picture : null,
    nip05: str(content.nip05),
    nip05Verified: null,
    createdAt: event.created_at,
  }
}

export class ProfileStore {
  private profiles = new Map<string, Profile | null>()
  private listeners = new Map<string, Set<() => void>>()
  private queued = new Set<string>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private readonly pool: Pick<SimplePool, 'querySync'>
  private readonly relays: readonly string[]
  private readonly fetchImpl: typeof fetch
  private readonly batchMs: number
  private extraRelays = new Set<string>()

  constructor(options: ProfileStoreOptions = {}) {
    this.pool = options.pool ?? defaultPool
    this.relays = options.relays ?? READ_RELAYS
    this.fetchImpl = options.fetch ?? ((...args) => fetch(...args))
    this.batchMs = options.batchMs ?? 80
  }

  /** A sub's relays are worth asking for its curator's and posters' profiles too. */
  addRelays(relays: readonly string[]): void {
    for (const r of relays) this.extraRelays.add(r)
  }

  get(pubkey: string): Profile | null {
    if (!this.profiles.has(pubkey)) {
      this.profiles.set(pubkey, null)
      this.queued.add(pubkey)
      this.schedule()
    }
    return this.profiles.get(pubkey) ?? null
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

  private schedule(): void {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, this.batchMs)
  }

  private async flush(): Promise<void> {
    const pubkeys = [...this.queued]
    this.queued.clear()
    if (pubkeys.length === 0) return
    const relays = [...new Set([...this.relays, ...this.extraRelays])]
    let events: Event[] = []
    try {
      events = await this.pool.querySync(relays, { kinds: [0], authors: pubkeys })
    } catch {
      events = []
    }
    const newest = new Map<string, Event>()
    for (const event of events) {
      const current = newest.get(event.pubkey)
      if (!current || event.created_at > current.created_at) newest.set(event.pubkey, event)
    }
    for (const pubkey of pubkeys) {
      const event = newest.get(pubkey)
      const profile: Profile = event
        ? profileFromEvent(event)
        : { pubkey, found: false, name: null, displayName: null, about: null, picture: null, nip05: null, nip05Verified: null, createdAt: 0 }
      this.set(profile)
      if (profile.nip05) void this.verifyNip05(profile)
    }
  }

  private async verifyNip05(profile: Profile): Promise<void> {
    const [name, domain] = profile.nip05!.includes('@') ? profile.nip05!.split('@') : ['_', profile.nip05!]
    let verified = false
    try {
      const response = await this.fetchImpl(`https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`)
      if (response.ok) {
        const body = await response.json()
        verified = typeof body?.names?.[name] === 'string' && body.names[name].toLowerCase() === profile.pubkey
      }
    } catch {
      verified = false
    }
    const current = this.profiles.get(profile.pubkey)
    if (current && current.createdAt === profile.createdAt) this.set({ ...current, nip05Verified: verified })
  }

  private set(profile: Profile): void {
    this.profiles.set(profile.pubkey, profile)
    for (const listener of this.listeners.get(profile.pubkey) ?? []) listener()
  }
}

export const profileStore = new ProfileStore()

/** A pubkey's profile: null while loading, `found: false` when nobody knows them. */
export function useProfile(pubkey: string | null): Profile | null {
  return useSyncExternalStore(
    (listener) => (pubkey ? profileStore.subscribe(pubkey, listener) : () => {}),
    () => (pubkey ? profileStore.get(pubkey) : null),
    () => null,
  )
}

/** What to call a pubkey: the profile's name when known, else a short npub-ish prefix. */
export function displayNameOf(profile: Profile | null, pubkey: string): string {
  return profile?.displayName || profile?.name || `${pubkey.slice(0, 8)}…`
}
