import { describe, expect, it } from 'vitest'
import { finalizeEvent } from 'nostr-tools/pure'
import { buildCuratedSchemaTemplate, parseCuratedSchemaEvent, verifyCuratedSchemaEvent } from '@/lib/protocol/curated'
import { ruleOf } from '@/lib/protocol/derive'
import { templateByKey } from '@/lib/protocol/templates'
import { addField, draftFromSchema, draftFromTemplate, draftToSchema, moveField, removeField, setRule, validateDraft } from '@/lib/entry/schemaForm'
import { pubkeyOf, testKey } from './keys'

const curator = pubkeyOf('curator')

describe('the sub editor', () => {
  it('a filled-in template publishes a verifiable schema and reads back as the same draft', () => {
    let draft = draftFromTemplate(templateByKey('links'))
    draft = { ...draft, name: 'Things worth a look', description: 'Links.', relays: ['wss://relay.example'] }
    expect(validateDraft(draft, { production: true }).filter((p) => !p.warning)).toEqual([])

    const schema = draftToSchema(draft, curator)
    expect(schema.identifier).toBe('things-worth-a-look')
    expect(schema.title).toBe('Things worth a look suggestion')
    const event = finalizeEvent(buildCuratedSchemaTemplate(schema, 1), testKey('curator'))
    expect(verifyCuratedSchemaEvent(event).ok).toBe(true)
    const parsed = parseCuratedSchemaEvent(event)!
    expect(ruleOf(parsed)).toBe('link-or-title')

    const again = draftFromSchema(parsed)
    expect(again.name).toBe('Things worth a look')
    expect(again.rule).toBe('link-or-title')
    expect(again.fields.map((f) => f.name)).toEqual(draft.fields.map((f) => f.name))
  })

  it('lists what is wrong: identity, relays, pubkeys, field names, enum options, patterns', () => {
    let draft = draftFromTemplate(templateByKey('custom'))
    const problems = validateDraft(draft, { production: true })
    expect(problems.map((p) => p.field)).toEqual(expect.arrayContaining(['d', 'name', 'description', 'relay']))

    draft = { ...draft, name: 'x', description: 'y', relays: ['ws://localhost:10547', 'https://not-a-relay'], authors: ['nope'], visibility: 'closed' }
    const p2 = validateDraft(draft, { production: true })
    expect(p2.some((p) => p.message.includes('insecure'))).toBe(true)
    expect(p2.some((p) => p.message.includes('not a ws:// or wss://'))).toBe(true)
    expect(p2.some((p) => p.field === 'authors' && !p.warning)).toBe(true)
    // in development the local relay is fine
    expect(validateDraft({ ...draft, relays: ['ws://localhost:10547'], authors: [] }, { production: false }).filter((p) => !p.warning)).toEqual([])

    draft = addField(addField({ ...draft, relays: ['wss://r'], authors: [] }, 'enum'), 'text')
    draft = { ...draft, fields: draft.fields.map((f) => (f.name === 'enum' ? { ...f, config: { options: [] } } : f.name === 'text' ? { ...f, name: 'title' } : f)) }
    const p3 = validateDraft(draft, { production: true })
    expect(p3.some((p) => p.message.includes('needs its options'))).toBe(true)
    expect(p3.some((p) => p.message.includes('Two fields are named "title"'))).toBe(true)
  })

  it('never removes d or title, moves and adds fields, and re-records the rule', () => {
    let draft = draftFromTemplate(templateByKey('links'))
    const count = draft.fields.length
    expect(removeField(draft, 0)).toBe(draft) // identifier
    expect(removeField(draft, 1)).toBe(draft) // title
    draft = removeField(draft, 2) // link
    expect(draft.fields.length).toBe(count - 1)
    expect(draft.requireAny).toEqual([['body']])

    draft = addField(draft, 'url')
    expect(draft.fields.at(-1)).toMatchObject({ name: 'url', type: 'url', config: { tag: 'r', marker: 'url' } })
    draft = moveField(draft, draft.fields.length - 1, 2)
    expect(draft.fields[2].name).toBe('url')

    draft = setRule(draft, 'title')
    expect(ruleOf(draftToSchema(draft, curator))).toBe('title')
  })
})
