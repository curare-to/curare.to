import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SimplePool } from 'nostr-tools/pool'
import { DirectoryStore } from '@/lib/store/directoryStore'
import { FakeRelay } from './fakeRelay'
import { signedBy } from './keys'

const schemaEvent = (salt: string, d: string, created_at: number, overrides: Record<string, string | null> = {}) => {
  const tags: string[][] = []
  const base: Record<string, string> = { d, title: `${d} suggestion`, name: d, description: `About ${d}.`, visibility: 'public' }
  for (const [k, v] of Object.entries({ ...base, ...overrides })) if (v !== null) tags.push([k, v])
  tags.push(['field', 'identifier', 'token', 'required', '', 'Identifier', '{"tag":"d","max":80}'], ['field', 'title', 'text', 'required', '', 'Title', '{"max":200}'])
  return signedBy(salt, { kind: 31889, tags, content: `About ${d}.`, created_at })
}

const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms))

describe('DirectoryStore', () => {
  let relay: FakeRelay
  const pool = new SimplePool()
  beforeAll(async () => {
    relay = await FakeRelay.start()
  })
  afterAll(async () => {
    pool.close([relay.url])
    await relay.close()
  })

  it('lists verified schemas newest first, one per coordinate, dropping the unusable, in pages', async () => {
    relay.seed(
      schemaEvent('a', 'alpha', 100),
      schemaEvent('a', 'alpha', 200, { description: 'Revised.' }), // the relay keeps the newer; the store would too
      schemaEvent('b', 'beta', 300),
      schemaEvent('c', 'gamma', 400, { visibility: null }), // unusable
      { ...schemaEvent('d', 'delta', 500), sig: 'f'.repeat(128) }, // forged
      schemaEvent('e', 'epsilon', 600),
      schemaEvent('f', 'zeta', 700),
    )
    const store = new DirectoryStore({ pool, relays: [relay.url], pageSize: 3 })
    store.subscribe(() => {})
    await settle()
    let snap = store.getSnapshot()
    // First page: the three newest — zeta, epsilon, delta. The forged one never
    // arrives: nostr-tools verifies signatures on the way in and discards it.
    expect(snap.entries.map((e) => e.schema.identifier)).toEqual(['zeta', 'epsilon'])
    expect(snap.dropped).toBe(0)
    expect(snap.exhausted).toBe(false)

    // Page by page until an empty page says there is nothing older.
    while (!store.getSnapshot().exhausted) await store.loadMore()
    snap = store.getSnapshot()
    expect(snap.entries.map((e) => e.schema.identifier)).toEqual(['zeta', 'epsilon', 'beta', 'alpha'])
    expect(snap.entries.find((e) => e.schema.identifier === 'alpha')?.schema.description).toBe('Revised.')
    // gamma, with no visibility, arrived and was dropped here.
    expect(snap.dropped).toBe(1)

    // A forged event handed in directly is caught here too.
    store.push({ ...JSON.parse(JSON.stringify(schemaEvent('g', 'eta', 900))), sig: 'f'.repeat(128) })
    expect(store.getSnapshot().dropped).toBe(2)
    expect(store.getSnapshot().entries.some((e) => e.schema.identifier === 'eta')).toBe(false)


    // A revision pushed in replaces its coordinate; an older one does not.
    store.push(schemaEvent('b', 'beta', 800, { description: 'Newer beta.' }))
    expect(store.getSnapshot().entries[0].schema.description).toBe('Newer beta.')
    store.push(schemaEvent('b', 'beta', 50, { description: 'Stale beta.' }))
    expect(store.getSnapshot().entries[0].schema.description).toBe('Newer beta.')
  })
})
