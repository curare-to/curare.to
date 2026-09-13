import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SimplePool } from 'nostr-tools/pool'
import type { Event } from 'nostr-tools/pure'
import { resolveSchema, newest } from '@/lib/resolve/schema'
import { FakeRelay } from './fakeRelay'
import { pubkeyOf, signedBy } from './keys'

const DESCRIPTION = 'A list of things.'
const schemaTags = (overrides: Record<string, string | null> = {}) => {
  const base: Record<string, string> = {
    d: 'things',
    title: 'things suggestion',
    name: 'things',
    description: DESCRIPTION,
    visibility: 'public',
    domain: 'things.example',
  }
  const tags: string[][] = []
  for (const [k, v] of Object.entries({ ...base, ...overrides })) if (v !== null) tags.push([k, v])
  tags.push(['field', 'identifier', 'token', 'required', '', 'Identifier', '{"tag":"d","max":80}'])
  tags.push(['field', 'title', 'text', 'required', '', 'Title', '{"max":200}'])
  return tags
}
const schemaBy = (salt: string, created_at: number, overrides: Record<string, string | null> = {}, relays: string[] = []): Event =>
  signedBy(salt, {
    kind: 31889,
    tags: [...schemaTags(overrides), ...relays.map((r) => ['relay', r])],
    content: DESCRIPTION,
    created_at,
  })

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('resolveSchema', () => {
  let relay: FakeRelay
  let other: FakeRelay
  const pool = new SimplePool()
  const curator = pubkeyOf('curator')

  beforeAll(async () => {
    relay = await FakeRelay.start()
    other = await FakeRelay.start()
  })
  afterAll(async () => {
    pool.close([relay.url, other.url])
    await relay.close()
    await other.close()
  })

  const deps = () => ({ pool, relays: [relay.url], fetch: async () => jsonResponse({}, 404), timeoutMs: 2000 })
  const byPubkey = (identifier = 'things') =>
    ({ by: 'coordinate', curator: { type: 'pubkey', pubkey: curator }, identifier }) as const

  it('finds a schema by pubkey and d, newest revision winning, and ignores a newer unusable one', async () => {
    const older = schemaBy('curator', 100)
    const newer = schemaBy('curator', 200, { description: 'Newer.' })
    const broken = schemaBy('curator', 300, { visibility: null })
    // The relay keeps one version per pubkey:d, so seed each on its own relay-side key
    // by publishing in order: newest last would replace — here we test the store's
    // choice, so give it the two usable ones and the broken one separately.
    relay.seed(older)
    let result = await resolveSchema(byPubkey(), deps())
    expect(result.status).toBe('ready')
    expect(result.status === 'ready' && result.schema.description).toBe(DESCRIPTION)

    relay.seed(newer)
    result = await resolveSchema(byPubkey(), deps())
    expect(result.status === 'ready' && result.schema.description).toBe('Newer.')

    // A relay that only holds a broken newer revision resolves to nothing usable.
    other.seed(broken)
    result = await resolveSchema(byPubkey(), { ...deps(), relays: [other.url] })
    expect(result.status).toBe('unavailable')
    expect(result.status === 'unavailable' && result.reason).toMatch(/no usable schema/)
  })

  it('follows the schema to the relays it names for a newer revision', async () => {
    const onDirectory = schemaBy('hopper', 100, { d: 'hop' }, [other.url])
    const onOwnRelay = schemaBy('hopper', 200, { d: 'hop', description: 'From the list’s own relay.' }, [other.url])
    relay.seed(onDirectory)
    other.seed(onOwnRelay)
    const result = await resolveSchema(
      { by: 'coordinate', curator: { type: 'pubkey', pubkey: pubkeyOf('hopper') }, identifier: 'hop' },
      deps(),
    )
    expect(result.status === 'ready' && result.schema.description).toMatch(/own relay/)
  })

  it('refuses a schema signed by a different key than the address names', async () => {
    const impostor = schemaBy('impostor', 500, { d: 'things' })
    relay.seed(impostor)
    const result = await resolveSchema(byPubkey(), deps())
    expect(result.status === 'ready' && result.schema.namespace).toBe(curator)
  })

  it('resolves a NIP-05 address to a pubkey, then to the schema', async () => {
    relay.seed(schemaBy('curator', 200))
    const fetch = async (url: string | URL | Request) => {
      expect(String(url)).toBe('https://things.example/.well-known/nostr.json?name=_')
      return jsonResponse({ names: { _: curator } })
    }
    const result = await resolveSchema(
      { by: 'coordinate', curator: { type: 'nip05', address: '_@things.example' }, identifier: 'things' },
      { ...deps(), fetch: fetch as typeof globalThis.fetch },
    )
    expect(result.status).toBe('ready')
  })

  it('says why a NIP-05 address does not resolve', async () => {
    const result = await resolveSchema(
      { by: 'coordinate', curator: { type: 'nip05', address: 'nobody@things.example' }, identifier: 'things' },
      { ...deps(), fetch: (async () => jsonResponse({ names: {} })) as typeof globalThis.fetch },
    )
    expect(result).toEqual({ status: 'unavailable', reason: 'nobody@things.example names no pubkey' })
  })

  describe('by domain', () => {
    const wellKnown = (event: unknown, status = 200) =>
      (async (url: string | URL | Request) => {
        expect(String(url)).toBe('https://things.example/.well-known/curare.to/nostr.json')
        return jsonResponse(event, status)
      }) as typeof globalThis.fetch

    it('takes the signed event the site serves', async () => {
      const served = schemaBy('curator', 150)
      const result = await resolveSchema({ by: 'domain', domain: 'Things.Example' }, { ...deps(), relays: [], fetch: wellKnown(served) })
      expect(result.status).toBe('ready')
      expect(result.status === 'ready' && result.event.id).toBe(served.id)
    })

    it('prefers a newer revision from the relays, by the same key and domain', async () => {
      const served = schemaBy('curator', 150)
      relay.seed(schemaBy('curator', 400, { description: 'Revised on the relay.' }))
      const result = await resolveSchema({ by: 'domain', domain: 'things.example' }, { ...deps(), fetch: wellKnown(served) })
      expect(result.status === 'ready' && result.schema.description).toBe('Revised on the relay.')
    })

    it('accepts a document with no domain tag — the site serving it is the association', async () => {
      const untagged = schemaBy('curator', 150, { domain: null })
      const result = await resolveSchema({ by: 'domain', domain: 'things.example' }, { ...deps(), relays: [], fetch: wellKnown(untagged) })
      expect(result.status).toBe('ready')
    })

    it('refuses a document whose domain tag is not the host', async () => {
      const wrong = schemaBy('curator', 150, { domain: 'elsewhere.example' })
      const result = await resolveSchema({ by: 'domain', domain: 'things.example' }, { ...deps(), fetch: wellKnown(wrong) })
      expect(result.status).toBe('unavailable')
      expect(result.status === 'unavailable' && result.reason).toMatch(/"elsewhere.example", not things.example/)
    })

    it('refuses a bad signature, an unusable schema, and a missing file, each with its reason', async () => {
      const good = schemaBy('curator', 150)
      const forged = { ...good, sig: 'a'.repeat(128) }
      let result = await resolveSchema({ by: 'domain', domain: 'things.example' }, { ...deps(), fetch: wellKnown(forged) })
      expect(result.status === 'unavailable' && result.reason).toMatch(/signature that does not verify/)

      const unusable = schemaBy('curator', 150, { visibility: null })
      result = await resolveSchema({ by: 'domain', domain: 'things.example' }, { ...deps(), fetch: wellKnown(unusable) })
      expect(result.status === 'unavailable' && result.reason).toMatch(/not a usable schema/)

      result = await resolveSchema({ by: 'domain', domain: 'things.example' }, { ...deps(), fetch: wellKnown({}, 404) })
      expect(result.status === 'unavailable' && result.reason).toMatch(/serves no list \(404/)
    })
  })

  it('breaks a created_at tie on id', () => {
    const a = { created_at: 1, id: 'a' }
    const b = { created_at: 1, id: 'b' }
    expect(newest([a, b])).toBe(b)
    expect(newest([b, a])).toBe(b)
  })
})
