import { describe, expect, it } from 'vitest'
import { bolt11Sats, buildReactionTemplate, parseReaction, parseZapReceipt, tally } from '@/lib/protocol/reactions'
import { compareBy, hot, wilson } from '@/lib/rank/hot'
import { followsOf, weightFor } from '@/lib/rank/wot'
import { pubkeyOf, signedBy } from './keys'

const curator = pubkeyOf('curator')
const post = signedBy('curator', { kind: 31890, tags: [['d', 'thing'], ['title', 'Thing']], content: '', created_at: 1000 })
const coordinate = `31890:${curator}:thing`

describe('reactions', () => {
  it('builds a NIP-25 vote with e, a, p and k', () => {
    const up = buildReactionTemplate({ target: post, direction: 'up', relay: 'wss://r', createdAt: 5 })
    expect(up).toEqual({
      kind: 7,
      content: '+',
      created_at: 5,
      tags: [['e', post.id, 'wss://r'], ['a', coordinate, 'wss://r'], ['p', curator], ['k', '31890']],
    })
    const comment = signedBy('bob', { kind: 1111, tags: [], content: 'c', created_at: 1 })
    const down = buildReactionTemplate({ target: comment, direction: 'down', createdAt: 5 })
    expect(down.content).toBe('-')
    expect(down.tags).toEqual([['e', comment.id, ''], ['p', comment.pubkey], ['k', '1111']])
  })

  it('counts one vote per pubkey, the newest winning, and nothing for an emoji', () => {
    const r = (salt: string, content: string, created_at: number, tags: string[][] = [['e', post.id], ['a', coordinate]]) =>
      parseReaction(signedBy(salt, { kind: 7, tags, content, created_at }))!
    const reactions = [
      r('bob', '+', 10),
      r('bob', '-', 20), // bob changed his mind
      r('carol', '', 10), // empty is an upvote
      r('dave', '🔥', 10), // counts for nothing
      r('erin', '+', 10, [['e', post.id]]), // an old client: e only, still counts
      r('frank', '+', 10, [['e', 'f'.repeat(64)], ['a', `31890:${curator}:other`]]), // another post
    ]
    const t = tally(reactions, [], [coordinate, post.id], { viewer: pubkeyOf('bob') })
    expect(t).toMatchObject({ up: 2, down: 1, score: 1, weighted: 1, trusted: 3, sats: 0, mine: 'down' })
  })

  it('weights by the viewer’s follows and sums sats from receipts', () => {
    const follows = followsOf(signedBy('viewer', { kind: 3, tags: [['p', pubkeyOf('carol')], ['p', 'not a key']], content: '', created_at: 1 }))
    expect(follows).toEqual(new Set([pubkeyOf('carol')]))
    const weight = weightFor(follows, pubkeyOf('viewer'), 0.2)
    const r = (salt: string, content: string) => parseReaction(signedBy(salt, { kind: 7, tags: [['e', post.id], ['a', coordinate]], content, created_at: 1 }))!
    const reactions = [r('carol', '+'), r('dave', '+'), r('erin', '-')]

    const request = JSON.stringify({ pubkey: pubkeyOf('zapper'), tags: [['amount', '21000']] })
    const receipt = parseZapReceipt(signedBy('wallet', { kind: 9735, tags: [['e', post.id], ['a', coordinate], ['description', request], ['bolt11', 'lnbc210n1garbage']], content: '', created_at: 2 }))!
    expect(receipt).toMatchObject({ sender: pubkeyOf('zapper'), sats: 21 })
    const fromInvoice = parseZapReceipt(signedBy('wallet', { kind: 9735, tags: [['e', post.id], ['bolt11', 'lnbc1500n1garbage']], content: '', created_at: 2 }))!
    expect(fromInvoice.sats).toBe(150)
    expect(bolt11Sats('lnbc1m1x')).toBe(100_000)
    expect(bolt11Sats('lnbc2500u1x')).toBe(250_000)
    expect(bolt11Sats('nope')).toBeNull()

    const t = tally(reactions, [receipt, fromInvoice], [coordinate, post.id], { weight })
    expect(t.score).toBe(1)
    expect(t.weighted).toBeCloseTo(1 + 0.2 - 0.2)
    expect(t.trusted).toBe(1)
    expect(t.sats).toBe(171)
  })
})

describe('ranking', () => {
  it('hot: ten votes buy about twelve and a half hours', () => {
    const t = 1_700_000_000
    expect(hot(10, t) - hot(0, t)).toBeCloseTo(1)
    expect(hot(0, t + 45000) - hot(0, t)).toBeCloseTo(1)
    expect(hot(-10, t)).toBeLessThan(hot(0, t))
    const items = [
      { id: 'a', createdAt: t, score: 0, sats: 0 },
      { id: 'b', createdAt: t - 40_000, score: 10, sats: 5 }, // older, but ten votes
      { id: 'c', createdAt: t - 50_000, score: 10, sats: 0 }, // too old for ten votes
    ]
    expect([...items].sort(compareBy('hot')).map((i) => i.id)).toEqual(['b', 'a', 'c'])
    expect([...items].sort(compareBy('top')).map((i) => i.id)).toEqual(['b', 'c', 'a'])
    expect([...items].sort(compareBy('new')).map((i) => i.id)).toEqual(['a', 'b', 'c'])
    expect([...items].sort(compareBy('sats')).map((i) => i.id)).toEqual(['b', 'c', 'a'])
  })

  it('wilson: few sure votes beat many mixed ones', () => {
    expect(wilson(0, 0)).toBe(0)
    expect(wilson(1, 0)).toBeCloseTo(0.2065, 3)
    expect(wilson(10, 0)).toBeGreaterThan(wilson(60, 40))
    expect(wilson(600, 400)).toBeGreaterThan(wilson(6, 4))
  })
})
