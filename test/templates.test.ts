import { describe, expect, it } from 'vitest'
import { finalizeEvent } from 'nostr-tools/pure'
import {
  buildCuratedSchemaTemplate,
  parseCuratedSchemaEvent,
  verifyCuratedSchemaEvent,
  verifyCuratedSuggestion,
  type CuratedSchema,
} from '@/lib/protocol/curated'
import { canonicalUrl, deriveIdentifier, ruleOf } from '@/lib/protocol/derive'
import { TEMPLATES } from '@/lib/protocol/templates'
import { emptyValues, identifierFor, prepareSuggestion } from '@/lib/entry/form'
import { pubkeyOf, testKey } from './keys'

const curator = pubkeyOf('curator')

/** A schema from a template, as the editor would publish it. */
function schemaFrom(template: (typeof TEMPLATES)[number]): CuratedSchema {
  return {
    identifier: template.key,
    namespace: curator,
    title: `${template.name} suggestion`,
    name: template.name,
    description: template.description,
    profileImageUrl: null,
    domain: null,
    kind: 31888,
    visibility: 'public',
    fields: template.fields,
    requireAny: template.requireAny,
    authors: [],
    relays: ['wss://relay.example'],
  }
}

const SAMPLE: Record<string, Record<string, string>> = {
  links: { title: 'A link', link: 'https://example.org/a', body: '', image: '', flair: 'news' },
  discussion: { title: 'A question', body: 'Why?', flair: 'question' },
  catalogue: { title: 'The Rise and Rise of Bitcoin', year: '2014', type: 'documentary', externalId: 'imdb:tt2821314', watchUrl: 'https://example.org/watch', referenceUrl: '', image: '', lang: 'en', description: '' },
  custom: { title: 'Anything' },
}

describe('templates', () => {
  for (const template of TEMPLATES) {
    it(`${template.key}: publishes a schema the module verifies, that the form can fill, with its rule recorded`, () => {
      const schema = schemaFrom(template)
      const event = finalizeEvent(buildCuratedSchemaTemplate(schema, 1), testKey('curator'))
      expect(verifyCuratedSchemaEvent(event).ok).toBe(true)
      const parsed = parseCuratedSchemaEvent(event)!
      expect(ruleOf(parsed)).toBe(template.rule)
      expect(parsed.fields.some((f) => (f.config.tag ?? f.name) === 't')).toBe(false)

      const values = { ...emptyValues(parsed), ...SAMPLE[template.key] }
      const prepared = prepareSuggestion(parsed, values, { pubkey: pubkeyOf('bob'), now: 2 })
      expect(prepared.errors).toEqual({})
      const signed = finalizeEvent(prepared.template!, testKey('bob'))
      expect(verifyCuratedSuggestion(signed, parsed).ok).toBe(true)
      expect(signed.tags.find((t) => t[0] === 'd')?.[1]).toBe(prepared.identifier)
    })
  }

  it('derives d by each rule', () => {
    const bob = pubkeyOf('bob')
    const carol = pubkeyOf('carol')
    // The same link, however written, is one post whoever submits it.
    const a = deriveIdentifier('link-or-title', { title: 'x', link: 'http://x.example/a?utm_source=t&b=2', pubkey: bob })
    const b = deriveIdentifier('link-or-title', { title: 'y', link: 'https://www.x.example/a/?b=2#frag', pubkey: carol })
    expect(a).toBe(b)
    expect(a).toMatch(/^url:[0-9a-f]{16}$/)
    // A text post is the title and its author.
    const t1 = deriveIdentifier('link-or-title', { title: 'Hello', pubkey: bob })
    const t2 = deriveIdentifier('link-or-title', { title: 'Hello', pubkey: carol })
    expect(t1).not.toBe(t2)
    expect(t1).toMatch(/^hello-[0-9a-f]{6}$/)
    expect(deriveIdentifier('title-author', { title: 'Hello', pubkey: bob })).toBe(t1)
    // A catalogue entry: the external id, else the title and year.
    expect(deriveIdentifier('external-or-title-year', { title: 'x', externalId: 'IMDB:tt1', year: '2014', pubkey: bob })).toBe('imdb:tt1')
    expect(deriveIdentifier('external-or-title-year', { title: 'The Thing', year: '1982', pubkey: bob })).toBe('the-thing-1982')
    expect(deriveIdentifier('title', { title: 'The Thing', pubkey: bob })).toBe('the-thing')
  })

  it('canonicalises links: scheme, www, ports, tracking, order, fragment, trailing slash', () => {
    expect(canonicalUrl('HTTPS://WWW.Example.org:443/a/b/?z=1&utm_campaign=x&a=2#top')).toBe('example.org/a/b?a=2&z=1')
    expect(canonicalUrl('http://example.org:8080/')).toBe('example.org:8080')
    expect(canonicalUrl('ftp://example.org/x')).toBeNull()
    expect(canonicalUrl('not a url')).toBeNull()
  })

  it('the form applies the schema’s recorded rule', () => {
    const links = parseCuratedSchemaEvent(finalizeEvent(buildCuratedSchemaTemplate(schemaFrom(TEMPLATES[0]), 1), testKey('curator')))!
    const values = { ...emptyValues(links), title: 'Post', link: 'https://example.org/p' }
    expect(identifierFor(links, values, pubkeyOf('bob'))).toBe(identifierFor(links, { ...values, title: 'Other' }, pubkeyOf('carol')))
    expect(identifierFor(links, { ...values, link: '' }, pubkeyOf('bob'))).toMatch(/^post-[0-9a-f]{6}$/)
    // Signed out, the fallback is the title's slug — the form asks for a key before publishing anyway.
    expect(identifierFor(links, values, null)).toBe('post')
  })
})
