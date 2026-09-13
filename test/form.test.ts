import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { finalizeEvent } from 'nostr-tools/pure'
import { parseCuratedSchemaEvent, verifyCuratedSuggestion, type CuratedSchema } from '@/lib/protocol/curated'
import { emptyValues, prepareSuggestion, promptedFields, valuesOfEntry } from '@/lib/entry/form'
import { pubkeyOf, testKey } from './keys'

const nipSchema = (): CuratedSchema => {
  const v = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'vectors', 'suggestion', 'nip-example.json'), 'utf8'))
  return parseCuratedSchemaEvent(v.schema)!
}

/** A schema with one field of every type, to drive every input rule. */
const everyType = (): CuratedSchema => ({
  identifier: 'every',
  namespace: pubkeyOf('curator'),
  title: 'every suggestion',
  name: 'every',
  description: 'One of each.',
  profileImageUrl: null,
  domain: null,
  kind: 31888,
  visibility: 'public',
  fields: [
    { name: 'identifier', type: 'token', required: true, placeholder: '', label: 'Identifier', config: { tag: 'd', max: 80, derived: true } },
    { name: 'title', type: 'text', required: true, placeholder: '', label: 'Title', config: { max: 20 } },
    { name: 'body', type: 'longtext', required: false, placeholder: '', label: 'Body', config: { tag: 'content', max: 50 } },
    { name: 'tag', type: 'token', required: false, placeholder: '', label: 'Tag', config: { max: 10, pattern: '[a-z]+' } },
    { name: 'link', type: 'url', required: false, placeholder: '', label: 'Link', config: { tag: 'r', marker: 'link', https: true } },
    { name: 'image', type: 'image', required: false, placeholder: '', label: 'Image', config: {} },
    { name: 'flair', type: 'enum', required: true, placeholder: '', label: 'Flair', config: { options: ['a', 'b'] } },
    { name: 'year', type: 'year', required: false, placeholder: '', label: 'Year', config: { min: 2000, max: 2030 } },
    { name: 'length', type: 'duration', required: false, placeholder: '', label: 'Length', config: { tag: 'duration', min: 1, max: 100 } },
    { name: 'count', type: 'number', required: false, placeholder: '', label: 'Count', config: { min: 0, max: 5 } },
  ],
  requireAny: [['body', 'link']],
  authors: [],
  relays: [],
})

describe('prepareSuggestion', () => {
  const pubkey = pubkeyOf('bob')

  it('starts every prompted field empty, enums at their first option, and derives d from the title', () => {
    const schema = everyType()
    const values = emptyValues(schema)
    expect(values).toEqual({ title: '', body: '', tag: '', link: '', image: '', flair: 'a', year: '', length: '', count: '' })
    const prepared = prepareSuggestion(schema, { ...values, title: 'Hello, World', body: 'x' }, { pubkey, now: 1 })
    expect(prepared.errors).toEqual({})
    expect(prepared.identifier).toBe('hello-world')
    expect(prepared.template?.tags).toContainEqual(['d', 'hello-world'])
    expect(prepared.template?.tags).toContainEqual(['a', `31889:${schema.namespace}:every`, '', 'root'])
    // and what it built verifies as a suggestion, signed
    const signed = finalizeEvent(prepared.template!, testKey('bob'))
    expect(verifyCuratedSuggestion(signed, schema).ok).toBe(true)
  })

  it('reports each field type’s rule, and the require-any group on its first field', () => {
    const schema = everyType()
    const bad = {
      title: 'this title is far too long for the cap',
      body: '',
      tag: 'Not-A-Token',
      link: 'http://insecure.example/',
      image: 'http://insecure.example/x.png',
      flair: 'c',
      year: '1999',
      length: '500',
      count: '9',
    }
    const { errors, template } = prepareSuggestion(schema, bad, { pubkey })
    expect(template).toBeNull()
    expect(Object.keys(errors).sort()).toEqual(['count', 'flair', 'image', 'length', 'link', 'tag', 'title', 'year'])

    const { errors: missing } = prepareSuggestion(schema, { ...emptyValues(schema), title: 'ok' }, { pubkey })
    expect(missing).toEqual({ body: 'Provide at least one of: Body, Link.' })
  })

  it('refuses a stranger on a closed list, and asks the signed-out to sign in', () => {
    const schema: CuratedSchema = { ...everyType(), visibility: 'closed', authors: [pubkeyOf('carol')] }
    const ok = { ...emptyValues(schema), title: 'ok', body: 'x' }
    expect(prepareSuggestion(schema, ok, { pubkey: pubkeyOf('carol') }).template).not.toBeNull()
    expect(prepareSuggestion(schema, ok, { pubkey: schema.namespace }).template).not.toBeNull()
    expect(prepareSuggestion(schema, ok, { pubkey: pubkeyOf('dave') }).errors.visibility).toMatch(/closed/)
    expect(prepareSuggestion(schema, ok, { pubkey: null }).errors.visibility).toMatch(/connect an authorised key/)

    const open = everyType()
    expect(prepareSuggestion(open, ok, { pubkey: null }).errors.visibility).toBe('Sign in to suggest to this list.')
  })

  it('edits an existing entry under its own d, from its own values', () => {
    const schema = nipSchema()
    const { event } = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'vectors', 'suggestion', 'nip-example.json'), 'utf8'))
    const values = valuesOfEntry(event, schema)
    expect(values.title).toBe('The Rise and Rise of Bitcoin')
    expect(values.year).toBe('2014')
    expect(values.description).toMatch(/^Follows programmer/)
    const prepared = prepareSuggestion(schema, { ...values, year: '2015' }, { pubkey: event.pubkey, identifier: 'imdb:tt2821314', now: 5 })
    expect(prepared.errors).toEqual({})
    expect(prepared.template?.tags).toContainEqual(['d', 'imdb:tt2821314'])
    expect(prepared.template?.tags).toContainEqual(['year', '2015'])
    // bitcoin.mov's derived hashtags fire for bitcoin.mov's own schema, where they are right
    expect(prepared.template?.tags).toContainEqual(['t', 'bitcoin'])
  })

  it('prompts for d when the schema does not derive it, and takes the value as the identifier', () => {
    const base = everyType()
    const schema: CuratedSchema = {
      ...base,
      fields: base.fields.map((f) =>
        f.name === 'identifier' ? { ...f, name: 'list', label: 'List coordinate', config: { tag: 'd', max: 200, pattern: '31889:[0-9a-f]{64}:.+' } } : f,
      ),
    }
    const prompted = promptedFields(schema)
    expect(prompted[0].field.name).toBe('list')
    expect(prompted.find((p) => p.field.name === 'body')?.anyOf).toEqual(['Body', 'Link'])
    expect(prompted.find((p) => p.field.name === 'body')?.required).toBe(false)

    const values = { ...emptyValues(schema), list: 'nope', title: 'x', body: 'y' }
    expect(prepareSuggestion(schema, values, { pubkey }).errors.list).toMatch(/not in the expected/)
    const coordinate = `31889:${'a'.repeat(64)}:films`
    const ok = prepareSuggestion(schema, { ...values, list: coordinate }, { pubkey, now: 1 })
    expect(ok.errors).toEqual({})
    expect(ok.identifier).toBe(coordinate)
    expect(ok.template?.tags).toContainEqual(['d', coordinate])
  })
})
