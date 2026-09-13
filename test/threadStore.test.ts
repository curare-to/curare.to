import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SimplePool } from 'nostr-tools/pool'
import { buildCommentTemplate } from '@/lib/protocol/comments'
import { ThreadStore } from '@/lib/store/threadStore'
import { FakeRelay } from './fakeRelay'
import { pubkeyOf, signedBy } from './keys'

const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms))

describe('ThreadStore', () => {
  let relay: FakeRelay
  const pool = new SimplePool()
  const curator = pubkeyOf('curator')
  const bob = pubkeyOf('bob')
  const suggestionRoot = { coordinate: `31888:${bob}:thing`, kind: 31888, pubkey: bob, id: '1'.repeat(64), relay: '' }
  const canonicalRoot = { coordinate: `31890:${curator}:thing`, kind: 31890, pubkey: curator, id: '2'.repeat(64), relay: '' }

  beforeAll(async () => {
    relay = await FakeRelay.start()
  })
  afterAll(async () => {
    pool.close([relay.url])
    await relay.close()
  })

  it('reads a thread across the group’s coordinates, follows live comments, and widens', async () => {
    const early = signedBy('carol', buildCommentTemplate({ root: suggestionRoot, content: 'while pending', createdAt: 100 }))
    const later = signedBy('dave', buildCommentTemplate({ root: canonicalRoot, content: 'after curation', createdAt: 200 }))
    const elsewhere = signedBy('erin', buildCommentTemplate({ root: { ...canonicalRoot, coordinate: `31890:${curator}:other` }, content: 'another post', createdAt: 300 }))
    relay.seed(early, later, elsewhere)

    // Only the canonical address known so far: the pending-era comment is not in scope yet.
    const store = new ThreadStore('k', [canonicalRoot.coordinate], [relay.url], { pool, loadingTimeoutMs: 3000 })
    const unsubscribe = store.subscribe(() => {})
    await settle()
    expect(store.getSnapshot().loading).toBe(false)
    expect(store.getSnapshot().comments.map((c) => c.content)).toEqual(['after curation'])

    // The group gains the suggestion's coordinate: the store reopens and merges.
    store.setCoordinates([canonicalRoot.coordinate, suggestionRoot.coordinate])
    await settle()
    expect(store.getSnapshot().tree.map((n) => n.comment.content)).toEqual(['after curation', 'while pending'])
    expect(store.getSnapshot().count).toBe(2)

    // A reply published later arrives live, under its parent.
    const parent = store.getSnapshot().comments.find((c) => c.content === 'while pending')!
    const reply = signedBy('frank', buildCommentTemplate({ root: suggestionRoot, parent, content: 'reply', createdAt: 400 }))
    await Promise.all(pool.publish([relay.url], reply))
    await settle()
    const tree = store.getSnapshot().tree
    expect(tree.find((n) => n.comment.content === 'while pending')?.replies.map((n) => n.comment.content)).toEqual(['reply'])
    expect(store.getSnapshot().count).toBe(3)

    // A pushed comment shows at once; one for another post is ignored.
    store.pushEvent(signedBy('grace', buildCommentTemplate({ root: canonicalRoot, content: 'mine', createdAt: 500 })))
    store.pushEvent(elsewhere)
    await settle(200)
    expect(store.getSnapshot().count).toBe(4)
    unsubscribe()
  })
})
