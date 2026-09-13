import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { finalizeEvent, type Event } from 'nostr-tools/pure'
import { parseCuratedSchemaEvent, verifyCuratedCanonical } from '@/lib/protocol/curated'
import { buildDeletionTemplate, buildRejectionTemplate, deletedIds, parseRejection } from '@/lib/protocol/labels'
import { approveTemplate, diffEntries, prepareCanonical } from '@/lib/entry/curate'
import { valuesOfEntry } from '@/lib/entry/form'
import { pubkeyOf, signedBy, testKey } from './keys'

const vector = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'vectors', 'suggestion', 'nip-example.json'), 'utf8'))
const schema = parseCuratedSchemaEvent(vector.schema)!
const suggestion: Event = vector.event
const curator = schema.namespace

describe('curating', () => {
  it('approves a suggestion as a canonical entry the verifier accepts, naming its source', () => {
    const prepared = approveTemplate(schema, suggestion, curator, 5)
    expect(prepared.errors).toEqual({})
    const signed = finalizeEvent(prepared.template!, testKey('curator'))
    expect(signed.pubkey).toBe(curator)
    expect(verifyCuratedCanonical(signed, schema).ok).toBe(true)
    expect(signed.tags).toContainEqual(['d', 'imdb:tt2821314'])
    expect(signed.tags).toContainEqual(['a', `31888:${suggestion.pubkey}:imdb:tt2821314`, '', 'mention'])
    expect(signed.tags).toContainEqual(['e', suggestion.id, '', 'mention'])
    expect(signed.tags).toContainEqual(['p', suggestion.pubkey])
  })

  it('refuses a non-curator before any extension is asked, and the signed-out', () => {
    expect(approveTemplate(schema, suggestion, pubkeyOf('bob')).errors.curator).toMatch(/Only the key that published/)
    expect(approveTemplate(schema, suggestion, null).errors.curator).toMatch(/Sign in/)
  })

  it('curates with corrections, and adds an entry nobody suggested', () => {
    const corrected = prepareCanonical(schema, { ...valuesOfEntry(suggestion, schema), year: '2015' }, { curator, identifier: 'imdb:tt2821314', source: suggestion, now: 6 })
    expect(corrected.template?.tags).toContainEqual(['year', '2015'])
    expect(verifyCuratedCanonical(finalizeEvent(corrected.template!, testKey('curator')), schema).ok).toBe(true)

    const own = prepareCanonical(schema, { ...valuesOfEntry(suggestion, schema), title: 'Mine' }, { curator, identifier: 'mine', source: null, now: 7 })
    expect(own.template?.tags.some((t) => t[0] === 'a' && t[1].startsWith('31888:'))).toBe(false)
    expect(verifyCuratedCanonical(finalizeEvent(own.template!, testKey('curator')), schema).ok).toBe(true)

    // and a bad value is a field error, not a template
    expect(prepareCanonical(schema, { ...valuesOfEntry(suggestion, schema), year: 'soon' }, { curator, identifier: 'x', source: null }).errors.year).toBeDefined()
  })

  it('diffs two versions field by field for re-curation', () => {
    const edited: Event = { ...suggestion, tags: suggestion.tags.map((t) => (t[0] === 'year' ? ['year', '2015'] : t)), content: 'A new blurb.' }
    expect(diffEntries(schema, suggestion, edited)).toEqual([
      { field: 'year', label: 'Year', before: '2014', after: '2015' },
      { field: 'description', label: 'Description / review', before: suggestion.content, after: 'A new blurb.' },
    ])
  })
})

describe('rejection labels', () => {
  it('builds a NIP-32 label the parser reads back, only from the curator', () => {
    const template = buildRejectionTemplate({ suggestion, reason: ' Not a film. ', relay: 'wss://r', createdAt: 9 })!
    expect(template.tags).toEqual([
      ['L', 'curare.to'],
      ['l', 'rejected', 'curare.to'],
      ['a', `31888:${suggestion.pubkey}:imdb:tt2821314`, 'wss://r'],
      ['p', suggestion.pubkey],
    ])
    const byCurator = finalizeEvent(template, testKey('curator'))
    expect(parseRejection(byCurator, curator)).toEqual({
      id: byCurator.id,
      coordinate: `31888:${suggestion.pubkey}:imdb:tt2821314`,
      pubkey: suggestion.pubkey,
      reason: 'Not a film.',
      createdAt: 9,
    })
    const byStranger = finalizeEvent(template, testKey('bob'))
    expect(parseRejection(byStranger, curator)).toBeNull()
    const otherNamespace = signedBy('curator', { ...template, tags: [['L', 'other'], ['l', 'rejected', 'other'], ...template.tags.slice(2)] })
    expect(parseRejection(otherNamespace, curator)).toBeNull()
  })

  it('a deletion names what it deletes', () => {
    const label = signedBy('curator', buildRejectionTemplate({ suggestion })!)
    const deletion = signedBy('curator', buildDeletionTemplate([label], 'changed my mind', 10))
    expect(deletion.tags).toEqual([['e', label.id], ['k', '1985']])
    expect(deletedIds(deletion)).toEqual([label.id])
  })
})
