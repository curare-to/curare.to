import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SimplePool } from 'nostr-tools/pool'
import { buildMutesTemplate, hitsMutedWord, isMuted, mergeMutes, parseMutes } from '@/lib/protocol/mutes'
import { buildReportTemplate, parseReport } from '@/lib/protocol/reports'
import { ReportStore } from '@/lib/store/reportStore'
import { FakeRelay } from './fakeRelay'
import { pubkeyOf, signedBy } from './keys'

const settle = (ms = 500) => new Promise((r) => setTimeout(r, ms))

describe('mutes', () => {
  it('reads public pubkeys and words, keeps private content across an edit, and matches whole words', async () => {
    const previous = signedBy('curator', { kind: 10000, tags: [['p', pubkeyOf('bob')], ['word', 'Casino']], content: 'ciphertext-the-extension-made', created_at: 1 })
    const mutes = await parseMutes(previous, null)
    expect(mutes.pubkeys).toEqual(new Set([pubkeyOf('bob')]))
    expect(mutes.words).toEqual(['casino'])
    expect(mutes.privateUnreadable).toBe(true)

    const edited = signedBy('curator', buildMutesTemplate({ pubkeys: [...mutes.pubkeys, pubkeyOf('carol')], words: [...mutes.words, ' Lottery '], previous, createdAt: 2 }))
    expect(edited.content).toBe('ciphertext-the-extension-made')
    expect(edited.tags).toEqual([['p', pubkeyOf('bob')], ['p', pubkeyOf('carol')], ['word', 'casino'], ['word', 'lottery']])

    expect(hitsMutedWord('Best CASINO tonight', ['casino'])).toBe(true)
    expect(hitsMutedWord('casinos are not a whole word', ['casino'])).toBe(false)
    const post = (salt: string, title: string) => signedBy(salt, { kind: 31888, tags: [['d', 'x'], ['title', title]], content: '', created_at: 1 })
    expect(isMuted(mutes, post('bob', 'fine'))).toBe(true)
    expect(isMuted(mutes, post('dave', 'The casino'))).toBe(true)
    expect(isMuted(mutes, post('dave', 'fine'))).toBe(false)

    const viewer = await parseMutes(signedBy('viewer', { kind: 10000, tags: [['p', pubkeyOf('erin')]], content: '', created_at: 1 }), null)
    const merged = mergeMutes(mutes, viewer)
    expect(merged.pubkeys).toEqual(new Set([pubkeyOf('bob'), pubkeyOf('erin')]))
    expect(merged.privateUnreadable).toBe(true)
  })
})

describe('reports', () => {
  let relay: FakeRelay
  const pool = new SimplePool()
  beforeAll(async () => {
    relay = await FakeRelay.start()
  })
  afterAll(async () => {
    pool.close([relay.url])
    await relay.close()
  })

  it('builds NIP-56 reports the parser reads back, and the store finds them by the reported ids', async () => {
    const post = signedBy('bob', { kind: 31888, tags: [['d', 'x'], ['title', 'x']], content: '', created_at: 1 })
    const template = buildReportTemplate({ target: post, type: 'spam', reason: ' Sells pills. ', createdAt: 2 })
    expect(template.tags).toEqual([['e', post.id, 'spam'], ['p', post.pubkey, 'spam']])
    const signed = signedBy('carol', template)
    expect(parseReport(signed)).toEqual({ id: signed.id, pubkey: pubkeyOf('carol'), createdAt: 2, targetId: post.id, targetPubkey: post.pubkey, type: 'spam', reason: 'Sells pills.' })
    expect(parseReport(signedBy('carol', { kind: 1984, tags: [['e', post.id, 'made-up']], content: '', created_at: 2 }))).toBeNull() // no p
    expect(parseReport(signedBy('carol', { kind: 1984, tags: [['e', post.id, 'made-up'], ['p', post.pubkey]], content: '', created_at: 2 }))?.type).toBe('other')

    relay.seed(signed, signedBy('dave', buildReportTemplate({ target: post, type: 'illegal', createdAt: 3 })))
    const store = new ReportStore([relay.url], { pool })
    store.subscribe(() => {})
    store.watch([post.id])
    await settle()
    expect(store.reportsOn([post.id]).map((r) => r.type)).toEqual(['illegal', 'spam'])
    expect(store.reportsOn(['nope'])).toEqual([])
    store.pushEvent(signedBy('erin', buildReportTemplate({ target: post, type: 'other', reason: 'meh', createdAt: 4 })))
    expect(store.reportsOn([post.id])).toHaveLength(3)
    store.close()
  })
})
