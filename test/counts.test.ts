import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SimplePool } from 'nostr-tools/pool'
import { buildCommentTemplate } from '@/lib/protocol/comments'
import { CommentCountStore } from '@/lib/store/threadStore'
import { relayInfo, clearRelayInfo } from '@/lib/nostr/relayInfo'
import { FakeRelay } from './fakeRelay'
import { pubkeyOf, signedBy } from './keys'

const settle = (ms = 600) => new Promise((r) => setTimeout(r, ms))

describe('comment counts', () => {
  let relay: FakeRelay
  const pool = new SimplePool()
  beforeAll(async () => {
    relay = await FakeRelay.start()
  })
  afterAll(async () => {
    pool.close([relay.url])
    await relay.close()
  })

  it('asks COUNT where a relay advertises NIP-45, and gathers by subscription elsewhere', async () => {
    const curator = pubkeyOf('curator')
    const root = { coordinate: `31890:${curator}:thing`, kind: 31890, pubkey: curator, id: '1'.repeat(64), relay: '' }
    for (let i = 0; i < 3; i++) relay.seed(signedBy(`c${i}`, buildCommentTemplate({ root, content: `c${i}`, createdAt: 100 + i })))

    const counting = new CommentCountStore([relay.url], { pool, countsOn: async () => true })
    counting.subscribe(() => {})
    counting.watch([root.coordinate])
    await settle()
    expect(counting.getSnapshot().get(root.coordinate)).toBe(3)
    expect(relay.counts.length).toBe(1)
    expect(relay.counts[0]).toEqual([{ kinds: [1111], '#A': [root.coordinate] }])
    counting.close()

    const gathering = new CommentCountStore([relay.url], { pool, countsOn: async () => false })
    gathering.subscribe(() => {})
    gathering.watch([root.coordinate])
    await settle()
    expect(gathering.getSnapshot().get(root.coordinate)).toBe(3)
    expect(relay.counts.length).toBe(1) // no new COUNT
    gathering.close()
  })

  it('reads NIP-11 once per relay, and treats no document as no support', async () => {
    clearRelayInfo()
    let calls = 0
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls += 1
      expect(String(url)).toBe('https://relay.example/')
      expect((init?.headers as Record<string, string>).Accept).toBe('application/nostr+json')
      return new Response(JSON.stringify({ name: 'r', supported_nips: [1, 45] }), { status: 200 })
    }) as typeof fetch
    const info = await relayInfo('wss://relay.example', fetchImpl)
    await relayInfo('wss://relay.example', fetchImpl)
    expect(calls).toBe(1)
    expect(info).toEqual({ url: 'wss://relay.example', name: 'r', description: null, supportedNips: [1, 45], reachable: true })
    const none = await relayInfo('wss://silent.example', (async () => new Response('', { status: 404 })) as typeof fetch)
    expect(none.reachable).toBe(false)
    expect(none.supportedNips).toEqual([])
  })
})
