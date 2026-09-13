import type { Event, EventTemplate } from 'nostr-tools/pure'

/**
 * NIP-07 provider injected by a signer extension (Alby, nos2x, …) or a
 * NIP-46 bunker bridge. We only ever call the two read/sign methods below —
 * the extension holds the private key and we never see it.
 */
export interface Nip07Provider {
  getPublicKey(): Promise<string>
  signEvent(event: EventTemplate): Promise<Event>
  getRelays?(): Promise<Record<string, { read: boolean; write: boolean }>>
  nip04?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>
    decrypt(pubkey: string, ciphertext: string): Promise<string>
  }
  /** curare.to's one addition to bitcoin.mov's type: NIP-44, for private subscriptions and mutes. */
  nip44?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>
    decrypt(pubkey: string, ciphertext: string): Promise<string>
  }
}

declare global {
  interface Window {
    nostr?: Nip07Provider
  }
}

export {}
