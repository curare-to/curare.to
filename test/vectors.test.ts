import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { verifyEvent, type Event } from 'nostr-tools/pure'
import {
  CURATED_CANONICAL_KIND,
  CURATED_SUGGESTION_KIND,
  parseCuratedSchemaEvent,
  verifyCuratedCanonical,
  verifyCuratedSchemaEvent,
  verifyCuratedSuggestion,
  type CuratedSchemaVerification,
} from '@/lib/protocol/curated'
import { postGroups } from '@/lib/protocol/group'

/* ------------------------------------------------------------------ *
 * Walks vectors/: every file is a statement about the protocol that the
 * copied module must agree with. The files are the spec's examples, one
 * mutation per verification rule, and two events bitcoin.mov actually
 * published. A Kotlin port can walk the same directory.
 * ------------------------------------------------------------------ */

const ROOT = path.resolve(__dirname, '..', 'vectors')

interface EntryVector {
  name: string
  note: string
  expect: 'valid' | 'invalid'
  reason?: string
  schema?: Event
  event: Event
  assert?: { fieldRequired?: Record<string, boolean> }
}

interface GroupVector {
  name: string
  schema: Event
  events: Event[]
  groups: {
    identifier: string
    state: 'curated' | 'pending'
    head: string
    canonical: string | null
    suggestions: string[]
    coordinates: string[]
  }[]
}

const load = <T,>(dir: string): [string, T][] =>
  fs
    .readdirSync(path.join(ROOT, dir))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => [f, JSON.parse(fs.readFileSync(path.join(ROOT, dir, f), 'utf8')) as T])

/** A vector that says `invalid` with reason `signature` fails only there. */
function expectSignature(vector: EntryVector) {
  if (vector.expect === 'invalid' && vector.reason === 'signature') {
    expect(verifyEvent(vector.event), `${vector.name}: signature should not verify`).toBe(false)
    return false
  }
  expect(verifyEvent(vector.event), `${vector.name}: signature should verify`).toBe(true)
  return true
}

function expectVerdict(vector: EntryVector, result: CuratedSchemaVerification) {
  const fields = result.violations.map((v) => v.field)
  if (vector.expect === 'valid') {
    expect(result.ok, `${vector.name}: expected valid, got ${JSON.stringify(result.violations)}`).toBe(true)
  } else {
    expect(result.ok, `${vector.name}: expected invalid`).toBe(false)
    expect(fields, `${vector.name}: expected a violation on "${vector.reason}"`).toContain(vector.reason)
  }
}

describe('vectors/schema', () => {
  for (const [file, vector] of load<EntryVector>('schema')) {
    it(`${file} — ${vector.expect}${vector.reason ? ` (${vector.reason})` : ''}`, () => {
      if (!expectSignature(vector)) return
      expectVerdict(vector, verifyCuratedSchemaEvent(vector.event))
      const schema = parseCuratedSchemaEvent(vector.event)
      expect(schema !== null).toBe(vector.expect === 'valid')
      for (const [name, required] of Object.entries(vector.assert?.fieldRequired ?? {})) {
        expect(schema?.fields.find((f) => f.name === name)?.required, `${vector.name}: ${name}`).toBe(required)
      }
    })
  }
})

function schemaOf(vector: EntryVector) {
  const schema = parseCuratedSchemaEvent(vector.schema!)
  expect(schema, `${vector.name}: its schema must be usable`).not.toBeNull()
  return schema!
}

describe('vectors/suggestion', () => {
  for (const [file, vector] of load<EntryVector>('suggestion')) {
    it(`${file} — ${vector.expect}${vector.reason ? ` (${vector.reason})` : ''}`, () => {
      if (!expectSignature(vector)) return
      expectVerdict(vector, verifyCuratedSuggestion(vector.event, schemaOf(vector)))
    })
  }
})

describe('vectors/canonical', () => {
  for (const [file, vector] of load<EntryVector>('canonical')) {
    it(`${file} — ${vector.expect}${vector.reason ? ` (${vector.reason})` : ''}`, () => {
      if (!expectSignature(vector)) return
      expectVerdict(vector, verifyCuratedCanonical(vector.event, schemaOf(vector)))
    })
  }
})

describe('vectors/group', () => {
  for (const [file, vector] of load<GroupVector>('group')) {
    it(`${file} — ${vector.groups.length} groups`, () => {
      const schema = parseCuratedSchemaEvent(vector.schema)!
      for (const event of vector.events) expect(verifyEvent(event)).toBe(true)
      const suggestions = vector.events.filter((e) => e.kind === CURATED_SUGGESTION_KIND)
      const canonicals = vector.events.filter((e) => e.kind === CURATED_CANONICAL_KIND)
      for (const e of suggestions) expect(verifyCuratedSuggestion(e, schema).ok).toBe(true)
      for (const e of canonicals) expect(verifyCuratedCanonical(e, schema).ok).toBe(true)

      const groups = postGroups(schema, { suggestions, canonicals }).map((g) => ({
        identifier: g.identifier,
        state: g.state,
        head: g.head.id,
        canonical: g.canonical?.id ?? null,
        suggestions: g.suggestions.map((s) => s.id),
        coordinates: g.coordinates,
      }))
      expect(groups).toEqual(vector.groups)

      // The same answer from any input order.
      const shuffled = [...vector.events].reverse()
      const again = postGroups(schema, {
        suggestions: shuffled.filter((e) => e.kind === CURATED_SUGGESTION_KIND),
        canonicals: shuffled.filter((e) => e.kind === CURATED_CANONICAL_KIND),
      }).map((g) => g.head.id)
      expect(again).toEqual(vector.groups.map((g) => g.head))
    })
  }
})
