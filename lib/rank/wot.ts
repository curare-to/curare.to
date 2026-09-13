import type { Event } from 'nostr-tools/pure'

/* ------------------------------------------------------------------ *
 * Web of trust, one hop: votes from pubkeys the viewer follows weigh 1,
 * everything else a default — 0.2, and 0 is a click away. Signed out, the
 * curator's follow list stands in. Second-hop follows need an index and
 * wait for one (appendix).
 * ------------------------------------------------------------------ */

/** everyone: the raw count; trusted: follows weigh 1, others 0.2; only-trusted: others 0. */
export type VoteMode = 'everyone' | 'trusted' | 'only-trusted'

export const DEFAULT_OTHER_WEIGHT = 0.2

export const VOTE_MODES: { key: VoteMode; label: string; hint: string }[] = [
  { key: 'everyone', label: 'Everyone', hint: 'Every vote counts once. Anyone can make a thousand keys.' },
  { key: 'trusted', label: 'Trusted', hint: 'Votes from keys you follow count once; the rest count a fifth.' },
  { key: 'only-trusted', label: 'Only trusted', hint: 'Only votes from keys you follow count.' },
]

export function otherWeightFor(mode: VoteMode): number {
  return mode === 'everyone' ? 1 : mode === 'trusted' ? DEFAULT_OTHER_WEIGHT : 0
}

/** The pubkeys a kind 3 follows. */
export function followsOf(event: Event): Set<string> {
  return new Set(event.tags.filter((t) => t[0] === 'p' && typeof t[1] === 'string' && /^[0-9a-f]{64}$/i.test(t[1])).map((t) => t[1].toLowerCase()))
}

/** A weight function: 1 for a follow (and for oneself), `other` for the rest. */
export function weightFor(follows: Set<string>, self: string | null, other = DEFAULT_OTHER_WEIGHT): (pubkey: string) => number {
  return (pubkey) => (pubkey === self || follows.has(pubkey) ? 1 : other)
}

/** The number a post shows under the viewer's mode. */
export function shownScore(tally: { score: number; weighted: number }, mode: VoteMode): number {
  return mode === 'everyone' ? tally.score : Math.round(tally.weighted * 10) / 10
}
