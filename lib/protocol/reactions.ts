import type { Event, EventTemplate } from 'nostr-tools/pure'

/* ------------------------------------------------------------------ *
 * Votes — NIP-25, kind 7 — and zaps — NIP-57, kind 9735 receipts — on a
 * post or a comment (docs/conventions.md).
 *
 * A vote is a reaction on the version the viewer is looking at: `e` is
 * required by NIP-25, `a` is added for an addressable target, `p` names its
 * author and `k` its kind. `+` (or nothing) is an upvote, `-` a downvote,
 * anything else counts for nothing. A post is a group of coordinates and
 * ids, so its votes are every reaction naming any of them, one vote per
 * pubkey — the newest wins, so changing a vote is publishing again.
 *
 * There is no total. A tally is one client's count of the reactions it
 * fetched, weighted as its viewer chose (lib/rank/wot.ts), and the page
 * says so where it shows one.
 * ------------------------------------------------------------------ */

export const REACTION_KIND = 7
export const ZAP_RECEIPT_KIND = 9735

export type Direction = 'up' | 'down'

export interface Reaction {
  id: string
  pubkey: string
  createdAt: number
  /** +1, −1, or 0 for an emoji or anything else. */
  value: 1 | -1 | 0
  targetId: string | null
  targetAddress: string | null
  event: Event
}

export interface ZapReceipt {
  id: string
  /** The zapper, from the zap request inside; the wallet's key otherwise. */
  sender: string
  createdAt: number
  sats: number
  targetId: string | null
  targetAddress: string | null
}

export interface Tally {
  up: number
  down: number
  /** up − down, unweighted. */
  score: number
  /** Σ weight(pubkey) · vote, with the viewer's weighting. */
  weighted: number
  /** How many of the voters had weight 1 — "trusted", for the hover. */
  trusted: number
  sats: number
  /** The viewer's own current vote, when they are one of the voters. */
  mine: Direction | null
}

export const EMPTY_TALLY: Tally = { up: 0, down: 0, score: 0, weighted: 0, trusted: 0, sats: 0, mine: null }

const tagOf = (event: { tags: string[][] }, name: string) => event.tags.find((t) => t[0] === name && typeof t[1] === 'string')?.[1] ?? null

/** The coordinate of an addressable event, or null. */
function addressOf(event: Pick<Event, 'kind' | 'pubkey' | 'tags'>): string | null {
  if (event.kind < 30000 || event.kind >= 40000) return null
  const d = tagOf(event, 'd')
  return d === null ? null : `${event.kind}:${event.pubkey}:${d}`
}

/** An unsigned vote on an event: NIP-25's `e` always, `a` when the target is addressable. */
export function buildReactionTemplate(options: { target: Event; direction: Direction; relay?: string; createdAt?: number }): EventTemplate {
  const { target, direction } = options
  const relay = options.relay ?? ''
  const tags: string[][] = [['e', target.id, relay]]
  const address = addressOf(target)
  if (address) tags.push(['a', address, relay])
  tags.push(['p', target.pubkey], ['k', String(target.kind)])
  return {
    kind: REACTION_KIND,
    tags,
    content: direction === 'up' ? '+' : '-',
    created_at: options.createdAt ?? Math.floor(Date.now() / 1000),
  }
}

export function parseReaction(event: Event): Reaction | null {
  if (event.kind !== REACTION_KIND) return null
  const targetId = tagOf(event, 'e')
  const targetAddress = tagOf(event, 'a')
  if (!targetId && !targetAddress) return null
  const content = event.content.trim()
  const value: 1 | -1 | 0 = content === '+' || content === '' ? 1 : content === '-' ? -1 : 0
  return { id: event.id, pubkey: event.pubkey, createdAt: event.created_at, value, targetId, targetAddress, event }
}

/** Amount in sats from a bolt11 invoice's human-readable part, or null. */
export function bolt11Sats(invoice: string): number | null {
  const m = /^ln(?:bc|tb|tbs|bcrt)(\d+)([munp]?)1/i.exec(invoice.trim())
  if (!m) return null
  const amount = Number(m[1])
  const multiplier: Record<string, number> = { '': 1e8, m: 1e5, u: 1e2, n: 0.1, p: 0.0001 }
  const sats = amount * multiplier[m[2].toLowerCase()]
  return Number.isFinite(sats) ? Math.floor(sats) : null
}

/** A NIP-57 receipt: the amount from the zap request's `amount` (msats) or the invoice. */
export function parseZapReceipt(event: Event): ZapReceipt | null {
  if (event.kind !== ZAP_RECEIPT_KIND) return null
  let sender = event.pubkey
  let sats: number | null = null
  const description = tagOf(event, 'description')
  if (description) {
    try {
      const request = JSON.parse(description)
      if (request && typeof request.pubkey === 'string') sender = request.pubkey
      const amount = Array.isArray(request?.tags) ? request.tags.find((t: string[]) => t[0] === 'amount')?.[1] : null
      if (amount && /^\d+$/.test(amount)) sats = Math.floor(Number(amount) / 1000)
    } catch {
      // an unreadable request: fall back to the invoice
    }
  }
  if (sats === null) {
    const bolt11 = tagOf(event, 'bolt11')
    sats = bolt11 ? bolt11Sats(bolt11) : null
  }
  if (sats === null || sats <= 0) return null
  return { id: event.id, sender, createdAt: event.created_at, sats, targetId: tagOf(event, 'e'), targetAddress: tagOf(event, 'a') }
}

/** What a reaction or receipt is about, for grouping: every id and coordinate it names. */
export function targetsOf(item: { targetId: string | null; targetAddress: string | null }): string[] {
  const keys: string[] = []
  if (item.targetId) keys.push(item.targetId)
  if (item.targetAddress) keys.push(item.targetAddress)
  return keys
}

/**
 * Tally the votes and sats for one target set — a post's coordinates and
 * ids, or a comment's id. One vote per pubkey, the newest winning; sats sum
 * per receipt. `weight` is the viewer's web-of-trust weighting.
 */
export function tally(
  reactions: Iterable<Reaction>,
  receipts: Iterable<ZapReceipt>,
  targets: Iterable<string>,
  options: { weight?: (pubkey: string) => number; viewer?: string | null } = {},
): Tally {
  const set = new Set(targets)
  const weight = options.weight ?? (() => 1)
  const latest = new Map<string, Reaction>()
  for (const reaction of reactions) {
    if (!targetsOf(reaction).some((t) => set.has(t))) continue
    const current = latest.get(reaction.pubkey)
    if (!current || reaction.createdAt > current.createdAt || (reaction.createdAt === current.createdAt && reaction.id > current.id)) {
      latest.set(reaction.pubkey, reaction)
    }
  }
  const result: Tally = { ...EMPTY_TALLY }
  for (const [pubkey, reaction] of latest) {
    if (reaction.value === 0) continue
    if (reaction.value > 0) result.up += 1
    else result.down += 1
    result.score += reaction.value
    const w = weight(pubkey)
    result.weighted += w * reaction.value
    if (w >= 1) result.trusted += 1
    if (options.viewer && pubkey === options.viewer) result.mine = reaction.value > 0 ? 'up' : 'down'
  }
  for (const receipt of receipts) {
    if (targetsOf(receipt).some((t) => set.has(t))) result.sats += receipt.sats
  }
  return result
}
