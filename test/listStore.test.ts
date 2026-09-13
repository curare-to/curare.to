import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SimplePool } from 'nostr-tools/pool'
import type { Event } from 'nostr-tools/pure'
import { parseCuratedSchemaEvent } from '@/lib/protocol/curated'
import { ListStore } from '@/lib/store/listStore'
import { FakeRelay } from './fakeRelay'
import { pubkeyOf, signedBy } from './keys'

const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms))

describe('ListStore', () => {
  let one: FakeRelay
  let two: FakeRelay
  const pool = new SimplePool()
  const curator = pubkeyOf('curator')

  const schemaEvent = (relays: string[]): Event =>
    signedBy('curator', {
      kind: 31889,
      tags: [
        ['d', 'things'], ['title', 'things suggestion'], ['name', 'things'],
        ['description', 'Things.'], ['visibility', 'public'],
        ['field', 'identifier', 'token', 'required', '', 'Identifier', '{"tag":"d","max":80}'],
        ['field', 'title', 'text', 'required', '', 'Title', '{"max":200}'],
        ['field', 'kind', 'enum', 'optional', '', 'Kind', '{"options":["a","b"]}'],
        ...relays.map((r) => ['relay', r]),
      ],
      content: 'Things.',
      created_at: 100,
    })
  const address = `31889:${curator}:things`
  const suggestion = (salt: string, d: string, created_at: number, extra: string[][] = []) =>
    signedBy(salt, {
      kind: 31888,
      tags: [['d', d], ['title', `Thing ${d} at ${created_at}`], ['a', address, '', 'root'], ['p', curator], ['k', '31889'], ...extra],
      content: '',
      created_at,
    })
  const canonical = (salt: string, d: string, created_at: number) =>
    signedBy(salt, {
      kind: 31890,
      tags: [['d', d], ['title', `Thing ${d}`], ['a', address, '', 'root'], ['p', curator], ['k', '31889']],
      content: '',
      created_at,
    })

  beforeAll(async () => {
    one = await FakeRelay.start()
    two = await FakeRelay.start()
  })
  afterAll(async () => {
    pool.close([one.url, two.url])
    await one.close()
    await two.close()
  })

  it('reads the schema’s relays, dedupes across them, keeps the newest version, drops the invalid', async () => {
    const schema = parseCuratedSchemaEvent(schemaEvent([one.url, two.url]))!
    const older = suggestion('bob', 'x', 200)
    const newer = suggestion('bob', 'x', 300)
    const carols = suggestion('carol', 'y', 250)
    const badEnum = suggestion('dave', 'z', 260, [['kind', 'c']])
    const impostor = canonical('bob', 'x', 400) // not the curator
    const real = canonical('curator', 'y', 410)

    one.seed(older, carols, badEnum, impostor, real)
    two.seed(newer, carols, real)

    const store = new ListStore(schema, { pool, loadingTimeoutMs: 3000, idleCloseMs: 50 })
    expect(store.relays).toEqual([one.url, two.url])
    expect(store.getSnapshot().loading).toBe(true)

    let notified = 0
    const unsubscribe = store.subscribe(() => {
      notified += 1
    })
    await settle()

    const snap = store.getSnapshot()
    expect(snap.loading).toBe(false)
    expect(notified).toBeGreaterThan(0)
    expect(snap.suggestions.map((e) => e.id).sort()).toEqual([newer.id, carols.id].sort())
    expect(snap.canonicals.map((e) => e.id)).toEqual([real.id])
    // The bad enum. The impostor's canonical never arrived: the `authors`
    // filter spares the relay the work. Handed in directly, the verifier
    // catches it too:
    expect(snap.dropped).toBe(1)
    store.pushEvent(impostor)
    await settle(200)
    expect(store.getSnapshot().dropped).toBe(2)
    expect(store.getSnapshot().canonicals.map((e) => e.id)).toEqual([real.id])

    const groups = Object.fromEntries(snap.groups.map((g) => [g.identifier, g]))
    expect(groups.x.state).toBe('pending')
    expect(groups.x.head.id).toBe(newer.id)
    expect(groups.y.state).toBe('curated')
    expect(groups.y.head.id).toBe(real.id)
    expect(groups.y.suggestions.map((e) => e.id)).toEqual([carols.id])
    expect(groups.z).toBeUndefined()

    // A later publish reaches the open subscription.
    const late = suggestion('erin', 'w', 500)
    await Promise.all(pool.publish([one.url], late))
    await settle()
    expect(store.getSnapshot().groups[0].head.id).toBe(late.id)

    // The snapshot object is stable when nothing changed.
    const before = store.getSnapshot()
    await settle(200)
    expect(store.getSnapshot()).toBe(before)

    unsubscribe()
    await settle(200)
    // Closed after idling; a publish now is not seen until someone subscribes again.
    const unseen = suggestion('frank', 'v', 600)
    await Promise.all(pool.publish([one.url], unseen))
    await settle()
    expect(store.getSnapshot().groups.some((g) => g.identifier === 'v')).toBe(false)

    store.subscribe(() => {})
    await settle()
    expect(store.getSnapshot().groups.some((g) => g.identifier === 'v')).toBe(true)
    store.close()
  })

  it('falls back to the directory relays when the schema names none', async () => {
    const schema = parseCuratedSchemaEvent(schemaEvent([]))!
    const store = new ListStore(schema, { pool, fallbackRelays: [two.url], loadingTimeoutMs: 3000 })
    expect(store.relays).toEqual([two.url])
    store.subscribe(() => {})
    await settle()
    expect(store.getSnapshot().loading).toBe(false)
    expect(store.getSnapshot().canonicals.length).toBe(1)
    store.close()
  })

  it('shows a pushed event before the relay echoes it', async () => {
    const schema = parseCuratedSchemaEvent(schemaEvent([one.url]))!
    const store = new ListStore(schema, { pool, loadingTimeoutMs: 3000 })
    store.subscribe(() => {})
    await settle()
    const mine = suggestion('grace', 'g', 700)
    store.pushEvent(mine)
    await settle(200)
    expect(store.getSnapshot().groups[0].head.id).toBe(mine.id)
    // and a push that fails verification is dropped, not shown
    store.pushEvent(suggestion('grace', 'h', 701, [['kind', 'nope']]))
    await settle(200)
    expect(store.getSnapshot().groups.some((g) => g.identifier === 'h')).toBe(false)
    store.close()
  })
})

describe('ListStore rejections', () => {
  it('hides a rejected suggestion from the groups until it is curated or the label is deleted', async () => {
    const relay = await FakeRelay.start()
    const pool = new SimplePool()
    const curator = pubkeyOf('curator')
    const address = `31889:${curator}:things`
    const schema = parseCuratedSchemaEvent(
      signedBy('curator', {
        kind: 31889,
        tags: [
          ['d', 'things'], ['title', 't'], ['name', 'things'], ['description', 'Things.'], ['visibility', 'public'],
          ['field', 'identifier', 'token', 'required', '', 'Identifier', '{"tag":"d","max":80}'],
          ['field', 'title', 'text', 'required', '', 'Title', '{"max":200}'],
          ['relay', relay.url],
        ],
        content: 'Things.',
        created_at: 100,
      }),
    )!
    const suggestion = signedBy('bob', {
      kind: 31888,
      tags: [['d', 'x'], ['title', 'X'], ['a', address, '', 'root'], ['p', curator], ['k', '31889']],
      content: '',
      created_at: 200,
    })
    const { buildRejectionTemplate, buildDeletionTemplate } = await import('@/lib/protocol/labels')
    const label = signedBy('curator', buildRejectionTemplate({ suggestion, reason: 'no', createdAt: 300 })!)
    const strangerLabel = signedBy('carol', buildRejectionTemplate({ suggestion, reason: 'me too', createdAt: 300 })!)
    relay.seed(suggestion, label, strangerLabel)

    const store = new ListStore(schema, { pool, loadingTimeoutMs: 3000 })
    store.subscribe(() => {})
    await settle()
    let group = store.getSnapshot().groups.find((g) => g.identifier === 'x')!
    expect(group.rejected).toBe(true)
    expect(group.rejections.map((r) => r.reason)).toEqual(['no'])

    // The suggester edits after the rejection: the label was about the earlier version.
    const edited = signedBy('bob', {
      kind: 31888,
      tags: [['d', 'x'], ['title', 'X, revised'], ['a', address, '', 'root'], ['p', curator], ['k', '31889']],
      content: '',
      created_at: 400,
    })
    await Promise.all(pool.publish([relay.url], edited))
    await settle()
    group = store.getSnapshot().groups.find((g) => g.identifier === 'x')!
    expect(group.rejected).toBe(false)

    // Rejected again, then the label deleted.
    const again = signedBy('curator', buildRejectionTemplate({ suggestion: edited, reason: 'still no', createdAt: 500 })!)
    store.pushEvent(again)
    await settle(200)
    expect(store.getSnapshot().groups.find((g) => g.identifier === 'x')!.rejected).toBe(true)
    store.pushEvent(signedBy('curator', buildDeletionTemplate([again], '', 600)))
    await settle(200)
    expect(store.getSnapshot().groups.find((g) => g.identifier === 'x')!.rejected).toBe(false)

    // Curated after all: a canonical entry stands whatever the labels say.
    store.pushEvent(again)
    store.pushEvent(signedBy('curator', { kind: 31890, tags: [['d', 'x'], ['title', 'X'], ['a', address, '', 'root'], ['p', curator], ['k', '31889']], content: '', created_at: 700 }))
    await settle(200)
    group = store.getSnapshot().groups.find((g) => g.identifier === 'x')!
    expect(group.state).toBe('curated')
    expect(group.rejected).toBe(false)

    store.close()
    pool.close([relay.url])
    await relay.close()
  })
})
