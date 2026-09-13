import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SimplePool } from 'nostr-tools/pool'
import { buildReactionTemplate } from '@/lib/protocol/reactions'
import { ReactionStore } from '@/lib/store/reactionStore'
import { FakeRelay } from './fakeRelay'
import { pubkeyOf, signedBy } from './keys'

const settle = (ms = 500) => new Promise((r) => setTimeout(r, ms))

describe('ReactionStore', () => {
  let relay: FakeRelay
  const pool = new SimplePool()
  beforeAll(async () => {
    relay = await FakeRelay.start()
  })
  afterAll(async () => {
    pool.close([relay.url])
    await relay.close()
  })

  it('tallies by coordinate and by id, follows live votes, and re-tallies with a weighting', async () => {
    const post = signedBy('curator', { kind: 31890, tags: [['d', 'thing']], content: '', created_at: 100 })
    const coordinate = `31890:${pubkeyOf('curator')}:thing`
    const comment = signedBy('bob', { kind: 1111, tags: [['A', coordinate]], content: 'c', created_at: 101 })

    relay.seed(
      signedBy('carol', buildReactionTemplate({ target: post, direction: 'up', createdAt: 200 })),
      signedBy('dave', buildReactionTemplate({ target: post, direction: 'up', createdAt: 200 })),
      signedBy('erin', buildReactionTemplate({ target: comment, direction: 'down', createdAt: 200 })),
      // an old client's vote: e only
      signedBy('frank', { kind: 7, tags: [['e', post.id]], content: '+', created_at: 200 }),
    )

    const store = new ReactionStore([relay.url], { pool })
    let notified = 0
    const unsubscribe = store.subscribe(() => {
      notified += 1
    })
    store.watch([coordinate], [post.id, comment.id])
    await settle(800)
    expect(notified).toBeGreaterThan(0)

    expect(store.tally([coordinate, post.id])).toMatchObject({ up: 3, down: 0, score: 3 })
    expect(store.tally([comment.id])).toMatchObject({ up: 0, down: 1, score: -1 })

    // Carol is trusted; the others weigh a fifth.
    const weight = (pk: string) => (pk === pubkeyOf('carol') ? 1 : 0.2)
    expect(store.tally([coordinate, post.id], { weight })).toMatchObject({ weighted: 1.4, trusted: 1 })

    // A live downvote from carol replaces her upvote.
    await Promise.all(pool.publish([relay.url], signedBy('carol', buildReactionTemplate({ target: post, direction: 'down', createdAt: 300 }))))
    await settle()
    expect(store.tally([coordinate, post.id], { viewer: pubkeyOf('carol') })).toMatchObject({ up: 2, down: 1, score: 1, mine: 'down' })

    // A pushed vote counts at once.
    store.pushEvent(signedBy('grace', buildReactionTemplate({ target: post, direction: 'up', createdAt: 400 })))
    await settle(200)
    expect(store.tally([coordinate, post.id]).score).toBe(2)
    unsubscribe()
  })
})
