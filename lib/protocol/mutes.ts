import type { Event, EventTemplate } from 'nostr-tools/pure'
import type { Decrypt } from './subscriptions'

/* NIP-51 kind 10000 — the mute list. The curator's applies inside their
 * list (bans, docs/conventions.md); the viewer's applies everywhere. Public
 * items are tags; private ones are NIP-44 in content, readable only by the
 * list's owner. */

export const MUTE_KIND = 10000

export interface Mutes {
  pubkeys: Set<string>
  words: string[]
  /** True when the content held private items this reader could not open. */
  privateUnreadable: boolean
}

export const NO_MUTES: Mutes = { pubkeys: new Set(), words: [], privateUnreadable: false }

export async function parseMutes(event: Event, decrypt: Decrypt | null): Promise<Mutes> {
  const pubkeys = new Set<string>()
  const words: string[] = []
  const take = (tag: string[]) => {
    if (tag[0] === 'p' && typeof tag[1] === 'string' && /^[0-9a-f]{64}$/i.test(tag[1])) pubkeys.add(tag[1].toLowerCase())
    if (tag[0] === 'word' && typeof tag[1] === 'string' && tag[1].trim()) words.push(tag[1].trim().toLowerCase())
  }
  if (event.kind !== MUTE_KIND) return { ...NO_MUTES }
  for (const tag of event.tags) take(tag)
  let privateUnreadable = false
  if (event.content.trim()) {
    if (!decrypt) privateUnreadable = true
    else {
      try {
        const hidden = JSON.parse(await decrypt(event.content))
        if (Array.isArray(hidden)) for (const tag of hidden) if (Array.isArray(tag)) take(tag.map(String))
      } catch {
        privateUnreadable = true
      }
    }
  }
  return { pubkeys, words, privateUnreadable }
}

/** Does a title (or any text) hit a muted word? Whole words, case-insensitive. */
export function hitsMutedWord(text: string, words: string[]): boolean {
  if (words.length === 0) return false
  const lower = text.toLowerCase()
  return words.some((w) => new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'u').test(lower))
}

/**
 * A mute list to publish: public pubkeys and words as tags, and — since the
 * list is replaceable and private items may be unreadable here — the
 * previous event's encrypted content carried over verbatim, so editing the
 * public part never drops the private part.
 */
export function buildMutesTemplate(options: {
  pubkeys: Iterable<string>
  words: Iterable<string>
  previous?: Pick<Event, 'content'> | null
  createdAt?: number
}): EventTemplate {
  return {
    kind: MUTE_KIND,
    tags: [
      ...[...new Set(options.pubkeys)].map((pk) => ['p', pk]),
      ...[...new Set([...options.words].map((w) => w.trim().toLowerCase()).filter(Boolean))].map((w) => ['word', w]),
    ],
    content: options.previous?.content ?? '',
    created_at: options.createdAt ?? Math.floor(Date.now() / 1000),
  }
}

/** Is an event's author muted, or its title a muted word? */
export function isMuted(mutes: Mutes, event: { pubkey: string; tags: string[][] }): boolean {
  if (mutes.pubkeys.has(event.pubkey)) return true
  const title = event.tags.find((t) => t[0] === 'title')?.[1] ?? ''
  return hitsMutedWord(title, mutes.words)
}

/** Two lists as one — the curator's inside their list, the viewer's everywhere. */
export function mergeMutes(...lists: Mutes[]): Mutes {
  return {
    pubkeys: new Set(lists.flatMap((m) => [...m.pubkeys])),
    words: [...new Set(lists.flatMap((m) => m.words))],
    privateUnreadable: lists.some((m) => m.privateUnreadable),
  }
}
