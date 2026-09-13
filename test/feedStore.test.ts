import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { SimplePool } from 'nostr-tools/pool'
import { parseCuratedSchemaEvent } from '@/lib/protocol/curated'
import { buildReactionTemplate } from '@/lib/protocol/reactions'
import { FakeRelay } from './fakeRelay'
import { pubkeyOf, signedBy } from './keys'

const settle = (ms = 500) => new Promise((r) => setTimeout(r, ms))

describe('FeedStore', () => {
  let relay: FakeRelay
  const pool = new SimplePool()
  beforeAll(async () => {
    relay = await FakeRelay.start()
    // The feed reaches the stores through their module-level registries, which use the app's pool;
    // point that pool at nothing and give the stores this one instead.
    vi.doMock('@/lib/nostr/pool', () => ({ pool }))
  })
  afterAll(async () => {
    pool.close([relay.url])
    await relay.close()
  })

  it('merges two subs’ front pages in hot order', async () => {
    const { FeedStore } = await import('@/lib/store/feedStore')
    const make = (salt: string, d: string) =>
      parseCuratedSchemaEvent(
        signedBy(salt, {
          kind: 31889,
          tags: [
            ['d', d], ['title', 't'], ['name', d], ['description', 'x'], ['visibility', 'public'], ['relay', relay.url],
            ['field', 'identifier', 'token', 'required', '', 'Identifier', '{"tag":"d","max":80}'],
            ['field', 'title', 'text', 'required', '', 'Title', '{"max":200}'],
          ],
          content: 'x',
          created_at: 1,
        }),
      )!
    const one = make('curator', 'one')
    const two = make('other curator', 'two')
    const canonical = (salt: string, schema: typeof one, d: string, created_at: number) =>
      signedBy(salt, {
        kind: 31890,
        tags: [['d', d], ['title', `${schema.name} ${d}`], ['a', `31889:${schema.namespace}:${schema.identifier}`, '', 'root']],
        content: '',
        created_at,
      })
    const t = 1_700_000_000
    const oneOld = canonical('curator', one, 'old', t - 40_000)
    const oneNew = canonical('curator', one, 'new', t)
    const twoMid = canonical('other curator', two, 'mid', t - 50_000)
    relay.seed(oneOld, oneNew, twoMid)
    // Twelve votes buy log10(12)·45000 ≈ 48,600 seconds: enough to lift the old one over both.
    for (let i = 0; i < 12; i++) relay.seed(signedBy(`voter ${i}`, buildReactionTemplate({ target: oneOld, direction: 'up', createdAt: t })))

    const feed = new FeedStore()
    feed.configure({ weight: () => 1, viewer: null, mode: 'everyone', sort: 'hot' })
    feed.setSchemas([one, two])
    feed.subscribe(() => {})
    await settle(1500)
    const items = feed.getSnapshot().items
    expect(items.map((i) => `${i.schema.name}/${i.group.identifier}`)).toEqual(['one/old', 'one/new', 'two/mid'])
    expect(items[0].tally.score).toBe(12)
    expect(pubkeyOf('curator')).toBe(one.namespace)

    feed.configure({ weight: () => 1, viewer: null, mode: 'everyone', sort: 'new' })
    await settle(300)
    expect(feed.getSnapshot().items.map((i) => i.group.identifier)).toEqual(['new', 'old', 'mid'])
  })
})
