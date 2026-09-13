import type { Event, EventTemplate } from 'nostr-tools/pure'
import { CURATED_SUGGESTION_KIND, parseCoordinate } from './curated'

/* ------------------------------------------------------------------ *
 * Rejection — NIP-32, kind 1985 — and its undoing — NIP-09, kind 5
 * (docs/conventions.md).
 *
 * A curator who declines a suggestion says so with a label in the
 * `curare.to` namespace on the suggestion's coordinate, so queues can hide
 * it and the suggester can see why. Only a label signed by the schema's
 * pubkey counts. It is undone by curating the entry after all, or by a
 * kind 5 deletion of the label.
 * ------------------------------------------------------------------ */

export const LABEL_KIND = 1985
export const DELETION_KIND = 5
export const LABEL_NAMESPACE = 'curare.to'
export const REJECTED = 'rejected'

export interface Rejection {
  id: string
  /** The suggestion's coordinate. */
  coordinate: string
  /** The suggester. */
  pubkey: string
  reason: string
  createdAt: number
}

export function buildRejectionTemplate(options: {
  suggestion: Pick<Event, 'pubkey' | 'tags'>
  reason?: string
  relay?: string
  createdAt?: number
}): EventTemplate | null {
  const d = options.suggestion.tags.find((t) => t[0] === 'd')?.[1]
  if (!d) return null
  return {
    kind: LABEL_KIND,
    tags: [
      ['L', LABEL_NAMESPACE],
      ['l', REJECTED, LABEL_NAMESPACE],
      ['a', `${CURATED_SUGGESTION_KIND}:${options.suggestion.pubkey}:${d}`, options.relay ?? ''],
      ['p', options.suggestion.pubkey],
    ],
    content: (options.reason ?? '').trim(),
    created_at: options.createdAt ?? Math.floor(Date.now() / 1000),
  }
}

/** A rejection by this curator, or null for any other label. */
export function parseRejection(event: Event, curator: string): Rejection | null {
  if (event.kind !== LABEL_KIND || event.pubkey !== curator) return null
  const namespaced = event.tags.some((t) => t[0] === 'L' && t[1] === LABEL_NAMESPACE)
  const rejected = event.tags.some((t) => t[0] === 'l' && t[1] === REJECTED && t[2] === LABEL_NAMESPACE)
  if (!namespaced || !rejected) return null
  const coordinate = event.tags.find((t) => t[0] === 'a' && typeof t[1] === 'string' && t[1].startsWith(`${CURATED_SUGGESTION_KIND}:`))?.[1]
  const parsed = coordinate ? parseCoordinate(coordinate) : null
  if (!coordinate || !parsed) return null
  return { id: event.id, coordinate, pubkey: parsed.pubkey, reason: event.content.trim(), createdAt: event.created_at }
}

/** NIP-09: delete one's own events by id. */
export function buildDeletionTemplate(events: Pick<Event, 'id' | 'kind'>[], reason = '', createdAt?: number): EventTemplate {
  const kinds = [...new Set(events.map((e) => String(e.kind)))]
  return {
    kind: DELETION_KIND,
    tags: [...events.map((e) => ['e', e.id]), ...kinds.map((k) => ['k', k])],
    content: reason,
    created_at: createdAt ?? Math.floor(Date.now() / 1000),
  }
}

/** The ids a kind 5 deletes. */
export function deletedIds(event: Event): string[] {
  if (event.kind !== DELETION_KIND) return []
  return event.tags.filter((t) => t[0] === 'e' && typeof t[1] === 'string').map((t) => t[1])
}
