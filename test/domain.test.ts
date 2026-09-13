import { describe, expect, it } from 'vitest'
import { finalizeEvent } from 'nostr-tools/pure'
import { buildCuratedSchemaTemplate, parseCuratedSchemaEvent, type CuratedSchema } from '@/lib/protocol/curated'
import { clearDomainCache, verifyClaimedDomain } from '@/lib/resolve/domain'
import { pubkeyOf, testKey } from './keys'

const schema = (): CuratedSchema => ({
  identifier: 'things',
  namespace: pubkeyOf('curator'),
  title: 't',
  name: 'things',
  description: 'x',
  profileImageUrl: null,
  domain: 'things.example',
  kind: 31888,
  visibility: 'public',
  fields: [
    { name: 'identifier', type: 'token', required: true, placeholder: '', label: 'Identifier', config: { tag: 'd', max: 80 } },
    { name: 'title', type: 'text', required: true, placeholder: '', label: 'Title', config: { max: 200 } },
  ],
  requireAny: [],
  authors: [],
  relays: [],
})

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('verifyClaimedDomain', () => {
  it('is verified only when NIP-05 and the well-known document both name the curator', async () => {
    const s = schema()
    const served = finalizeEvent(buildCuratedSchemaTemplate(s, 1), testKey('curator'))
    const answers = (nip05: unknown, wellKnown: unknown) =>
      (async (url: string | URL | Request) => (String(url).includes('nostr.json?name=_') ? json(nip05) : json(wellKnown))) as typeof fetch

    clearDomainCache()
    expect(await verifyClaimedDomain(s, answers({ names: { _: s.namespace } }, served))).toBe('verified')
    clearDomainCache()
    expect(await verifyClaimedDomain(s, answers({ names: { _: pubkeyOf('other curator') } }, served))).toBe('unverified')
    clearDomainCache()
    const impostor = finalizeEvent(buildCuratedSchemaTemplate({ ...s, namespace: pubkeyOf('other curator') }, 1), testKey('other curator'))
    expect(await verifyClaimedDomain(s, answers({ names: { _: s.namespace } }, impostor))).toBe('unverified')
    clearDomainCache()
    expect(await verifyClaimedDomain(s, (async () => json({}, 404)) as typeof fetch)).toBe('unverified')
    expect(await verifyClaimedDomain({ ...s, domain: null })).toBe('unclaimed')
    expect(parseCuratedSchemaEvent(served)?.domain).toBe('things.example')
  })
})
