import type { Event } from 'nostr-tools/pure'
import {
  CURATED_CANONICAL_KIND,
  CURATED_SUGGESTION_KIND,
  curatedCanonicalSource,
  parseCoordinate,
  type CuratedSchema,
} from './curated'

/* ------------------------------------------------------------------ *
 * A post is a group of coordinates (docs/decentralized-reddit.md, decision 4).
 *
 * Several people may suggest the same subject and share a `d`; the curator's
 * canonical entry has that `d` too and names one of them as its source. The
 * site treats the whole set as one post:
 *
 *   group(schema, d) =
 *       { 31890:<curator>:<d> }                                the canonical entry
 *     ∪ { 31888:<p>:<d>  for every valid suggestion of d }     every version proposed
 *     ∪ { the coordinate the canonical's 31888: `a` names }    the source, even if its d differs
 *
 * The head of the group is the canonical entry when there is one, else the
 * newest suggestion. Comments and reactions are fetched with the group's
 * coordinates as one `#A` / `#a` filter and shown as one thread and one score.
 *
 * Pure: given a schema and already-verified events, it returns groups. The
 * store is responsible for verifying and for keeping the newest version per
 * coordinate before calling this.
 * ------------------------------------------------------------------ */

export interface PostGroup {
  /** The `d` shared by everything in the group. */
  identifier: string
  /** The curator's canonical entry, or null while the post is only suggested. */
  canonical: Event | null
  /**
   * Every valid suggestion sharing the `d`, plus the canonical's named source
   * when its `d` differs. Newest first.
   */
  suggestions: Event[]
  /** What represents the group: the canonical entry, else the newest suggestion. */
  head: Event
  state: 'curated' | 'pending'
  /**
   * Every coordinate in the group — the canonical's address first, whether or
   * not it exists yet — for the `#A` / `#a` filters comments and reactions are
   * read with.
   */
  coordinates: string[]
  /** Every event id in the group, for the `#e` filter reports are read with. */
  ids: string[]
}

/** The `d` tag of an addressable event, or null. */
export function identifierOf(event: { tags: string[][] }): string | null {
  const d = event.tags.find((t) => t[0] === 'd' && typeof t[1] === 'string')?.[1]
  return d && d.trim() ? d.trim() : null
}

/** `<kind>:<pubkey>:<d>` for an addressable event, or null without a `d`. */
export function coordinateOf(event: {
  kind: number
  pubkey: string
  tags: string[][]
}): string | null {
  const d = identifierOf(event)
  return d ? `${event.kind}:${event.pubkey}:${d}` : null
}

/** The address a post has in its sub, from the moment it is suggested. */
export function canonicalAddress(schema: CuratedSchema, identifier: string): string {
  return `${CURATED_CANONICAL_KIND}:${schema.namespace}:${identifier}`
}

const byNewest = (a: Event, b: Event): number =>
  b.created_at - a.created_at || (a.id < b.id ? 1 : -1)

/**
 * Fold verified suggestions and canonical entries into post groups, newest
 * head first. Events of the wrong kind, or without a `d`, are ignored — the
 * verifier ran before this, so there should be none.
 */
export function postGroups(
  schema: CuratedSchema,
  events: { suggestions: Iterable<Event>; canonicals: Iterable<Event> },
): PostGroup[] {
  const suggestionsByCoordinate = new Map<string, Event>()
  const suggestionsById = new Map<string, Event[]>()
  for (const event of events.suggestions) {
    if (event.kind !== CURATED_SUGGESTION_KIND) continue
    const d = identifierOf(event)
    if (!d) continue
    suggestionsByCoordinate.set(`${event.kind}:${event.pubkey}:${d}`, event)
    const list = suggestionsById.get(d) ?? []
    list.push(event)
    suggestionsById.set(d, list)
  }

  const canonicalById = new Map<string, Event>()
  for (const event of events.canonicals) {
    if (event.kind !== CURATED_CANONICAL_KIND) continue
    const d = identifierOf(event)
    if (!d) continue
    const existing = canonicalById.get(d)
    if (!existing || byNewest(event, existing) < 0) canonicalById.set(d, event)
  }

  // A suggestion pulled into a group as a canonical's source with a different
  // `d` still belongs to its own `d` group as well; it is not moved, only
  // referenced, so the same event can appear in two groups.
  const groups: PostGroup[] = []
  const identifiers = new Set<string>([...suggestionsById.keys(), ...canonicalById.keys()])

  for (const identifier of identifiers) {
    const canonical = canonicalById.get(identifier) ?? null
    const suggestions = [...(suggestionsById.get(identifier) ?? [])]

    if (canonical) {
      const source = curatedCanonicalSource(canonical, schema)
      const parsed = source ? parseCoordinate(source.address) : null
      if (source && parsed && parsed.identifier !== identifier) {
        const sourceEvent = suggestionsByCoordinate.get(source.address)
        if (sourceEvent && !suggestions.includes(sourceEvent)) suggestions.push(sourceEvent)
      }
    }
    suggestions.sort(byNewest)

    const head = canonical ?? suggestions[0]
    if (!head) continue

    const coordinates = [canonicalAddress(schema, identifier)]
    const ids: string[] = []
    if (canonical) ids.push(canonical.id)
    for (const suggestion of suggestions) {
      const coordinate = coordinateOf(suggestion)
      if (coordinate && !coordinates.includes(coordinate)) coordinates.push(coordinate)
      ids.push(suggestion.id)
    }

    groups.push({
      identifier,
      canonical,
      suggestions,
      head,
      state: canonical ? 'curated' : 'pending',
      coordinates,
      ids,
    })
  }

  groups.sort((a, b) => byNewest(a.head, b.head))
  return groups
}
