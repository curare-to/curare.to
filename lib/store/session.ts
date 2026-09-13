'use client'

import { useSyncExternalStore } from 'react'
import type { Event } from 'nostr-tools/pure'
import { getNip07 } from '@/lib/nostr/nip07'
import { pool } from '@/lib/nostr/pool'
import { directoryRelays } from '@/lib/nostr/relays'
import { isRelayUrl } from '@/lib/protocol/curated'

/* ------------------------------------------------------------------ *
 * Who is looking.
 *
 * Signed in means a pubkey from the NIP-07 extension — never a key — plus
 * the pubkey's NIP-65 write relays, so that what they publish here also
 * reaches their own relays as a courtesy (decision 5). The pubkey is kept
 * in localStorage so a reload stays signed in without re-prompting; it is
 * public information, and the extension is asked to sign every event
 * regardless.
 * ------------------------------------------------------------------ */

export type Session =
  | { status: 'checking'; pubkey: null; writeRelays: string[] }
  | { status: 'signed-out'; pubkey: null; writeRelays: string[]; extension: boolean }
  | { status: 'signed-in'; pubkey: string; writeRelays: string[] }

const STORAGE_KEY = 'curare.to:pubkey'
const CHECKING: Session = { status: 'checking', pubkey: null, writeRelays: [] }

/** NIP-65: `r` tags, write when unmarked or marked write. */
export function writeRelaysOf(event: Event): string[] {
  return [
    ...new Set(
      event.tags
        .filter((t) => t[0] === 'r' && typeof t[1] === 'string' && (t[2] === undefined || t[2] === 'write'))
        .map((t) => t[1].trim())
        .filter((r) => isRelayUrl(r)),
    ),
  ]
}

class SessionStore {
  private session: Session = CHECKING
  private listeners = new Set<() => void>()
  private started = false

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    this.start()
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): Session => this.session
  getServerSnapshot = (): Session => CHECKING

  private start(): void {
    if (this.started || typeof window === 'undefined') return
    this.started = true
    let stored: string | null = null
    try {
      stored = window.localStorage.getItem(STORAGE_KEY)
    } catch {
      stored = null
    }
    if (stored && /^[0-9a-f]{64}$/.test(stored)) {
      this.set({ status: 'signed-in', pubkey: stored, writeRelays: [] })
      void this.loadWriteRelays(stored)
      return
    }
    // Extensions inject window.nostr after load; look a few times before deciding.
    let tries = 0
    const check = () => {
      if (getNip07()) {
        this.set({ status: 'signed-out', pubkey: null, writeRelays: [], extension: true })
        return
      }
      tries += 1
      if (tries >= 6) {
        this.set({ status: 'signed-out', pubkey: null, writeRelays: [], extension: false })
        return
      }
      setTimeout(check, 250)
    }
    check()
  }

  signIn = async (): Promise<string | null> => {
    const provider = getNip07()
    if (!provider) {
      this.set({ status: 'signed-out', pubkey: null, writeRelays: [], extension: false })
      return null
    }
    try {
      const pubkey = (await provider.getPublicKey()).toLowerCase()
      if (!/^[0-9a-f]{64}$/.test(pubkey)) return null
      try {
        window.localStorage.setItem(STORAGE_KEY, pubkey)
      } catch {
        // storage may be unavailable; the session still holds for this page
      }
      this.set({ status: 'signed-in', pubkey, writeRelays: [] })
      void this.loadWriteRelays(pubkey)
      return pubkey
    } catch {
      return null
    }
  }

  signOut = (): void => {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // nothing to clear
    }
    this.set({ status: 'signed-out', pubkey: null, writeRelays: [], extension: !!getNip07() })
  }

  private async loadWriteRelays(pubkey: string): Promise<void> {
    let events: Event[] = []
    try {
      events = await pool.querySync([...directoryRelays()], { kinds: [10002], authors: [pubkey] })
    } catch {
      events = []
    }
    const newest = events.sort((a, b) => b.created_at - a.created_at || (a.id < b.id ? -1 : 1))[0]
    if (!newest) return
    const current = this.session
    if (current.status === 'signed-in' && current.pubkey === pubkey) {
      this.set({ ...current, writeRelays: writeRelaysOf(newest) })
    }
  }

  private set(session: Session): void {
    this.session = session
    for (const listener of this.listeners) listener()
  }
}

export const sessionStore = new SessionStore()

export function useSession(): Session {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot, sessionStore.getServerSnapshot)
}
