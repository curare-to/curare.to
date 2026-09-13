import type { Event, EventTemplate } from 'nostr-tools/pure'
import { CURATED_SCHEMA_KIND, parseCoordinate } from './curated'

/* ------------------------------------------------------------------ *
 * Subscriptions — kind 10889, provisional (docs/conventions.md).
 *
 * A NIP-51-shaped replaceable list of `a` tags naming schema coordinates,
 * with private items NIP-44-encrypted in .content as NIP-51 describes. A
 * kind of the family's own rather than NIP-51's 10004, which is defined
 * for kind 34550 communities: a client that rebuilds a user's community
 * list from its own model would drop what it does not understand.
 *
 * Encryption is the extension's (NIP-07 nip44, to oneself); this module
 * takes the functions and never a key.
 * ------------------------------------------------------------------ */

export const SUBSCRIPTIONS_KIND = 10889

export interface Subscription {
  coordinate: string
  relay: string
  private: boolean
}

export type Encrypt = (plaintext: string) => Promise<string>
export type Decrypt = (ciphertext: string) => Promise<string>

const isSchemaCoordinate = (value: string) => parseCoordinate(value)?.kind === CURATED_SCHEMA_KIND

/** The unsigned list: public items as tags, private items encrypted into content. */
export async function buildSubscriptionsTemplate(
  subscriptions: Subscription[],
  encrypt: Encrypt | null,
  createdAt?: number,
): Promise<EventTemplate> {
  const seen = new Set<string>()
  const unique = subscriptions.filter((s) => {
    if (seen.has(s.coordinate) || !isSchemaCoordinate(s.coordinate)) return false
    seen.add(s.coordinate)
    return true
  })
  const tags = unique.filter((s) => !s.private).map((s) => ['a', s.coordinate, s.relay])
  const hidden = unique.filter((s) => s.private).map((s) => ['a', s.coordinate, s.relay])
  let content = ''
  if (hidden.length > 0) {
    if (!encrypt) throw new Error('A private subscription needs an extension that can encrypt (NIP-44).')
    content = await encrypt(JSON.stringify(hidden))
  }
  return { kind: SUBSCRIPTIONS_KIND, tags, content, created_at: createdAt ?? Math.floor(Date.now() / 1000) }
}

/** Read a list back. Private items need `decrypt`; without it they are counted but not named. */
export async function parseSubscriptions(
  event: Event,
  decrypt: Decrypt | null,
): Promise<{ subscriptions: Subscription[]; privateUnreadable: boolean }> {
  if (event.kind !== SUBSCRIPTIONS_KIND) return { subscriptions: [], privateUnreadable: false }
  const subscriptions: Subscription[] = []
  const seen = new Set<string>()
  const take = (tag: string[], isPrivate: boolean) => {
    if (tag[0] !== 'a' || typeof tag[1] !== 'string' || !isSchemaCoordinate(tag[1]) || seen.has(tag[1])) return
    seen.add(tag[1])
    subscriptions.push({ coordinate: tag[1], relay: typeof tag[2] === 'string' ? tag[2] : '', private: isPrivate })
  }
  for (const tag of event.tags) take(tag, false)

  let privateUnreadable = false
  if (event.content.trim()) {
    if (!decrypt) privateUnreadable = true
    else {
      try {
        const hidden = JSON.parse(await decrypt(event.content))
        if (Array.isArray(hidden)) for (const tag of hidden) if (Array.isArray(tag)) take(tag.map(String), true)
      } catch {
        privateUnreadable = true
      }
    }
  }
  return { subscriptions, privateUnreadable }
}
