import { createHash } from 'node:crypto'
import { finalizeEvent, getPublicKey, type Event, type EventTemplate } from 'nostr-tools/pure'

/** Deterministic throwaway keys for tests — the same derivation as the vectors. */
export function testKey(salt: string): Uint8Array {
  return new Uint8Array(createHash('sha256').update(`curare.to/vectors/${salt}`).digest())
}

export function signedBy(salt: string, template: EventTemplate): Event {
  return finalizeEvent(template, testKey(salt))
}

export function pubkeyOf(salt: string): string {
  return getPublicKey(testKey(salt))
}
