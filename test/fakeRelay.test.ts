import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SimplePool } from 'nostr-tools/pool'
import { FakeRelay } from './fakeRelay'
import { signedBy } from './keys'

describe('FakeRelay', () => {
  let relay: FakeRelay
  const pool = new SimplePool()
  beforeAll(async () => {
    relay = await FakeRelay.start()
  })
  afterAll(async () => {
    pool.close([relay.url])
    await relay.close()
  })

  it('stores what is published, answers a REQ, and pushes later events', async () => {
    const first = signedBy('a', { kind: 1, tags: [['t', 'x']], content: 'first', created_at: 100 })
    await Promise.all(pool.publish([relay.url], first))

    const received: string[] = []
    let eose = false
    const sub = pool.subscribeMany([relay.url], { kinds: [1], '#t': ['x'] }, {
      onevent: (e) => received.push(e.content),
      oneose: () => {
        eose = true
      },
    })
    await new Promise((r) => setTimeout(r, 150))
    expect(eose).toBe(true)
    expect(received).toEqual(['first'])

    const second = signedBy('a', { kind: 1, tags: [['t', 'x']], content: 'second', created_at: 200 })
    await Promise.all(pool.publish([relay.url], second))
    await new Promise((r) => setTimeout(r, 150))
    expect(received).toEqual(['first', 'second'])
    sub.close()
  })

  it('keeps the newest version of an addressable event and refuses a bad signature', async () => {
    const older = signedBy('b', { kind: 30001, tags: [['d', 'one']], content: 'older', created_at: 100 })
    const newer = signedBy('b', { kind: 30001, tags: [['d', 'one']], content: 'newer', created_at: 200 })
    await Promise.all(pool.publish([relay.url], newer))
    await Promise.all(pool.publish([relay.url], older))
    const found = await pool.querySync([relay.url], { kinds: [30001], '#d': ['one'] })
    expect(found.map((e) => e.content)).toEqual(['newer'])

    const forged = { ...older, sig: '0'.repeat(128) }
    const results = await Promise.allSettled(pool.publish([relay.url], forged))
    expect(results[0].status).toBe('rejected')
  })
})
