// Regenerates vectors/**.json. Deterministic: keys are derived from fixed
// salts and every created_at is fixed, so re-running changes nothing unless
// a case here changed. Run with `node test/vectors/generate.mjs` from the
// repository root. This is test tooling — it publishes nothing anywhere.
//
// The tags are written out by hand from docs/NIP.md rather than built with
// the module under test, so the vectors are an independent statement of the
// spec. Two vectors are real events: bitcoin.mov's published schema (its
// well-known file, copied as-is) and one canonical entry from its relay.

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const out = (dir, name, data) => {
  const file = path.join(root, 'vectors', dir, `${name}.json`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n')
}

const key = (salt) => createHash('sha256').update(`curare.to/vectors/${salt}`).digest()
const KEYS = {
  curator: key('curator'),
  other: key('other curator'),
  bob: key('suggester bob'),
  carol: key('suggester carol'),
  dave: key('suggester dave'),
  erin: key('suggester erin'),
}
const PK = Object.fromEntries(Object.entries(KEYS).map(([k, sk]) => [k, getPublicKey(sk)]))

const sign = (sk, { kind, tags, content = '', created_at }) =>
  finalizeEvent({ kind, tags, content, created_at }, sk)

const RELAY = 'wss://relay.example.com'
const T0 = 1735689600

/* ------------------------------ schema ------------------------------ */

const DESCRIPTION =
  'Fields for a bitcoin.mov entry: a Bitcoin movie, documentary, short, interview or series, with at least one link to watch or look it up.'

// The NIP's example schema, tag for tag.
const schemaTags = () => [
  ['d', 'bitcoin.mov'],
  ['title', 'bitcoin.mov suggestion'],
  ['name', 'bitcoin.mov'],
  ['description', DESCRIPTION],
  ['k', '31888'],
  ['visibility', 'public'],
  ['picture', 'https://bitcoin.mov/icon.svg'],
  ['domain', 'bitcoin.mov'],
  ['relay', RELAY],
  ['field', 'identifier', 'token', 'required', 'the-rise-and-rise-of-bitcoin-2014', 'Identifier', '{"tag":"d","max":80,"derived":true}'],
  ['field', 'title', 'text', 'required', 'The Rise and Rise of Bitcoin', 'Title', '{"max":200}'],
  ['field', 'year', 'year', 'optional', '2014', 'Year', '{"min":1900,"max":2100}'],
  ['field', 'type', 'enum', 'required', 'documentary', 'Type', '{"options":["movie","documentary","short","interview","series","other"]}'],
  ['field', 'watchUrl', 'url', 'optional', 'https://youtube.com/watch?v=…', 'Watch / reference URL', '{"tag":"r","marker":"watch","max":500,"repeat":true}'],
  ['field', 'imdbUrl', 'url', 'optional', 'https://imdb.com/title/tt2821314', 'IMDb URL', '{"tag":"r","marker":"imdb","max":500}'],
  ['field', 'image', 'image', 'optional', 'https://…/poster.jpg', 'Poster image URL (https)', '{"max":500}'],
  ['field', 'hashtags', 'token', 'optional', 'bitcoin', 'Hashtags', '{"tag":"t","max":60,"repeat":true,"derived":true}'],
  ['field', 'description', 'longtext', 'optional', 'Why is this worth watching?', 'Description / review', '{"tag":"content","max":4000}'],
  ['require-any', 'watchUrl', 'imdbUrl'],
]

const schemaEvent = (mutate = (t) => t, opts = {}) =>
  sign(opts.sk ?? KEYS.curator, {
    kind: opts.kind ?? 31889,
    tags: mutate(schemaTags()),
    content: DESCRIPTION,
    created_at: opts.created_at ?? T0,
  })

const without = (tag) => (tags) => tags.filter((t) => t[0] !== tag)
const replace = (tag, value) => (tags) => tags.map((t) => (t[0] === tag ? [tag, value] : t))

const SCHEMA = schemaEvent()
const ADDRESS = `31889:${PK.curator}:bitcoin.mov`

const schemaVector = (name, event, expect, reason, note) => ({
  name,
  note,
  expect,
  ...(reason ? { reason } : {}),
  event,
})

out('schema', 'nip-example', schemaVector('nip-example', SCHEMA, 'valid', null,
  "The NIP's example schema, signed by a throwaway key (the NIP's pubkey cannot sign here)."))
out('schema', 'missing-visibility', schemaVector('missing-visibility', schemaEvent(without('visibility')), 'invalid', 'visibility',
  'visibility is never defaulted: a list that does not say who may suggest is not one a client should act on.'))
out('schema', 'bad-visibility', schemaVector('bad-visibility', schemaEvent(replace('visibility', 'friends')), 'invalid', 'visibility',
  'visibility must be public, closed or private.'))
out('schema', 'missing-name', schemaVector('missing-name', schemaEvent(without('name')), 'invalid', 'name',
  'name is required.'))
out('schema', 'missing-title', schemaVector('missing-title', schemaEvent(without('title')), 'invalid', 'title',
  'title is required.'))
out('schema', 'missing-description', schemaVector('missing-description',
  sign(KEYS.curator, { kind: 31889, tags: without('description')(schemaTags()), content: '', created_at: T0 }),
  'invalid', 'description', 'description is required; content may stand in for the tag, and here both are absent.'))
out('schema', 'description-from-content', schemaVector('description-from-content',
  sign(KEYS.curator, { kind: 31889, tags: without('description')(schemaTags()), content: DESCRIPTION, created_at: T0 }),
  'valid', null, 'The description tag is absent but .content carries it; a client MAY fall back to .content.'))
out('schema', 'no-fields', schemaVector('no-fields', schemaEvent((t) => t.filter((x) => x[0] !== 'field' && x[0] !== 'require-any')), 'invalid', 'field',
  'A schema with no field tags is not a usable schema.'))
out('schema', 'bad-relay', schemaVector('bad-relay', schemaEvent(replace('relay', 'https://relay.example.com')), 'invalid', 'relay',
  'A relay must be a ws:// or wss:// URL; a client that accepted this could silently fail to publish.'))
out('schema', 'bad-domain', schemaVector('bad-domain', schemaEvent(replace('domain', 'not a hostname')), 'invalid', 'domain',
  'domain must be a bare hostname of at least two labels.'))
out('schema', 'wrong-kind', schemaVector('wrong-kind', schemaEvent((t) => t, { kind: 31888 }), 'invalid', 'kind',
  'Schema tags on a kind 31888 event are not a schema.'))
out('schema', 'relaxed-identifier', {
  ...schemaVector('relaxed-identifier',
    schemaEvent((t) => t.map((x) => x[0] === 'field' && x[1] === 'identifier' ? [...x.slice(0, 3), 'optional', ...x.slice(4)] : x)),
    'valid', null,
    'A schema that relaxes the d field is still usable, but a client MUST put the field back to required.'),
  assert: { fieldRequired: { identifier: true, title: true } },
})
{
  const bad = { ...SCHEMA, sig: 'f'.repeat(128) }
  out('schema', 'bad-signature', schemaVector('bad-signature', bad, 'invalid', 'signature',
    'The event is a usable schema by its tags; its signature does not verify, and a client MUST check the signature first.'))
}

// The real thing, as served at https://bitcoin.mov/.well-known/curare.to/nostr.json
const published = JSON.parse(fs.readFileSync(path.join(root, 'test/vectors/bitcoin-mov-published.json'), 'utf8'))
out('schema', 'bitcoin-mov-published', schemaVector('bitcoin-mov-published', published, 'valid', null,
  "bitcoin.mov's schema exactly as its site serves it at /.well-known/curare.to/nostr.json (copied 2026-09-13)."))

/* ---------------------------- suggestions ---------------------------- */

const suggestionTags = () => [
  ['d', 'imdb:tt2821314'],
  ['title', 'The Rise and Rise of Bitcoin'],
  ['year', '2014'],
  ['type', 'documentary'],
  ['director', 'Nicholas Mross'],
  ['r', 'http://bitcoindoc.com/', 'watch'],
  ['r', 'https://www.imdb.com/title/tt2821314/', 'imdb'],
  ['image', 'https://upload.wikimedia.org/wikipedia/en/9/96/The_Rise_and_Rise_of_Bitcoin_%282014%29_Film_Poster.jpg'],
  ['i', 'imdb:tt2821314'],
  ['lang', 'en'],
  ['t', 'bitcoin'],
  ['t', 'documentary'],
  ['a', ADDRESS, RELAY, 'root'],
  ['p', PK.curator],
  ['k', '31889'],
]
const SUGGESTION_CONTENT =
  "Follows programmer Daniel Mross and the early Bitcoin community from 2011 onward — the miners, entrepreneurs and evangelists of Bitcoin's formative years."

const suggestionEvent = (mutate = (t) => t, opts = {}) =>
  sign(opts.sk ?? KEYS.bob, {
    kind: opts.kind ?? 31888,
    tags: mutate(suggestionTags()),
    content: opts.content ?? SUGGESTION_CONTENT,
    created_at: opts.created_at ?? T0 + 60,
  })

const SUGGESTION = suggestionEvent()

const entryVector = (name, schema, event, expect, reason, note) => ({
  name,
  note,
  expect,
  ...(reason ? { reason } : {}),
  schema,
  event,
})

out('suggestion', 'nip-example', entryVector('nip-example', SCHEMA, SUGGESTION, 'valid', null,
  "The NIP's example suggestion, in reply to the example schema."))
out('suggestion', 'missing-title', entryVector('missing-title', SCHEMA, suggestionEvent(without('title')), 'invalid', 'title',
  'Every required field must be present and non-empty.'))
out('suggestion', 'missing-identifier', entryVector('missing-identifier', SCHEMA, suggestionEvent(without('d')), 'invalid', 'identifier',
  'The d field is mandatory on every list.'))
out('suggestion', 'repeated-year', entryVector('repeated-year', SCHEMA, suggestionEvent((t) => [...t, ['year', '2015']]), 'invalid', 'year',
  'A field without repeat may not appear more than once.'))
out('suggestion', 'bad-year', entryVector('bad-year', SCHEMA, suggestionEvent(replace('year', 'twenty fourteen')), 'invalid', 'year',
  'A year is an integer bounded by min and max.'))
out('suggestion', 'bad-enum', entryVector('bad-enum', SCHEMA, suggestionEvent(replace('type', 'musical')), 'invalid', 'type',
  'An enum value must be one of the options.'))
out('suggestion', 'insecure-image', entryVector('insecure-image', SCHEMA,
  suggestionEvent(replace('image', 'http://example.com/poster.jpg')), 'invalid', 'image',
  'An image must be https: — browsers block insecure images on secure pages.'))
out('suggestion', 'no-links', entryVector('no-links', SCHEMA, suggestionEvent(without('r')), 'invalid', 'watchUrl',
  'Every require-any group needs at least one field present; the violation names the group\'s first field.'))
out('suggestion', 'no-root', entryVector('no-root', SCHEMA, suggestionEvent(without('a')), 'invalid', 'schema',
  'A suggestion must reply to its schema once the schema has a coordinate.'))
out('suggestion', 'wrong-root', entryVector('wrong-root', SCHEMA,
  suggestionEvent((t) => t.map((x) => (x[0] === 'a' ? ['a', `31889:${PK.other}:bitcoin.mov`, RELAY, 'root'] : x))),
  'invalid', 'schema', "A suggestion replying to another curator's schema is not a suggestion to this one."))
out('suggestion', 'wrong-kind', entryVector('wrong-kind', SCHEMA, suggestionEvent((t) => t, { kind: 31890 }), 'invalid', 'kind',
  'Verified as a suggestion, a kind 31890 event fails on kind.'))
out('suggestion', 'extra-tags', entryVector('extra-tags', SCHEMA,
  suggestionEvent((t) => [...t, ['client', 'some other app'], ['r', 'https://example.com/trailer', 'trailer'], ['L', 'x'], ['l', 'y', 'x']]),
  'valid', null, 'Tags the schema does not define MAY be present and MUST be ignored.'))
{
  const bad = { ...SUGGESTION, sig: '0'.repeat(128) }
  out('suggestion', 'bad-signature', entryVector('bad-signature', SCHEMA, bad, 'invalid', 'signature',
    'Well-formed against the schema, but the signature does not verify.'))
}

// A closed list: the curator and the p-tagged pubkeys may suggest, nobody else.
const CLOSED = schemaEvent((t) => [
  ...t.map((x) => (x[0] === 'visibility' ? ['visibility', 'closed'] : x)),
  ['p', PK.carol],
])
out('suggestion', 'closed-allowed', entryVector('closed-allowed', CLOSED, suggestionEvent((t) => t, { sk: KEYS.carol }), 'valid', null,
  'A p-tagged pubkey may suggest to a closed list.'))
out('suggestion', 'closed-stranger', entryVector('closed-stranger', CLOSED, suggestionEvent((t) => t, { sk: KEYS.dave }), 'invalid', 'visibility',
  'A pubkey not on a closed list may not suggest to it.'))
out('suggestion', 'closed-curator', entryVector('closed-curator', CLOSED, suggestionEvent((t) => t, { sk: KEYS.curator }), 'valid', null,
  'The curator may always suggest to their own list.'))

/* ----------------------------- canonical ----------------------------- */

const canonicalTags = (source = SUGGESTION) => [
  ...suggestionTags(),
  ['a', `31888:${source.pubkey}:imdb:tt2821314`, '', 'mention'],
  ['e', source.id, '', 'mention'],
  ['p', source.pubkey],
]

const canonicalEvent = (mutate = (t) => t, opts = {}) =>
  sign(opts.sk ?? KEYS.curator, {
    kind: opts.kind ?? 31890,
    tags: mutate(canonicalTags()),
    content: opts.content ?? SUGGESTION_CONTENT,
    created_at: opts.created_at ?? T0 + 120,
  })

const CANONICAL = canonicalEvent()

out('canonical', 'nip-example', entryVector('nip-example', SCHEMA, CANONICAL, 'valid', null,
  "The NIP's example canonical entry: the suggestion's fields, signed by the curator, naming its source."))
out('canonical', 'no-source', entryVector('no-source', SCHEMA,
  canonicalEvent((t) => t.filter((x) => !(x[0] === 'a' && x[1].startsWith('31888:')) && x[0] !== 'e' && !(x[0] === 'p' && x[1] === PK.bob))),
  'valid', null, 'A curator MAY add an entry nobody suggested: the source reference is optional.'))
out('canonical', 'wrong-signer', entryVector('wrong-signer', SCHEMA, canonicalEvent((t) => t, { sk: KEYS.bob }), 'invalid', 'curator',
  "A canonical event's pubkey MUST be the schema's pubkey. Curation is not delegated."))
out('canonical', 'bad-source', entryVector('bad-source', SCHEMA,
  canonicalEvent((t) => t.map((x) => (x[0] === 'a' && x[1].startsWith('31888:') ? ['a', '31888:not-a-pubkey:imdb:tt2821314', '', 'mention'] : x))),
  'invalid', 'source', 'A 31888: a tag, when present, MUST be a well-formed coordinate.'))
out('canonical', 'missing-title', entryVector('missing-title', SCHEMA, canonicalEvent(without('title')), 'invalid', 'title',
  'A canonical entry answers to the same schema as a suggestion.'))
out('canonical', 'wrong-kind', entryVector('wrong-kind', SCHEMA, canonicalEvent((t) => t, { kind: 31888 }), 'invalid', 'kind',
  'Verified as canonical, a kind 31888 event fails on kind — even when the curator signed it.'))
out('canonical', 'corrected-on-the-way', entryVector('corrected-on-the-way', SCHEMA,
  canonicalEvent(replace('year', '2015')), 'valid', null,
  'Curation is editorial: the curator may correct a field on the way through, and the entry still verifies.'))

// The real thing: one of bitcoin.mov's canonical entries, from its relay. Its
// source suggestion is no longer on that relay, which is why a canonical event
// carries the full fields rather than a pointer.
const live = JSON.parse(fs.readFileSync(path.join(root, 'test/vectors/bitcoin-mov-canonical.json'), 'utf8'))
out('canonical', 'bitcoin-mov-relay', entryVector('bitcoin-mov-relay', published, live, 'valid', null,
  "A canonical entry the bitcoin.mov curator published, fetched from wss://ephemeral.mantra.press on 2026-09-13, verified against the published schema. The suggestion it names (an a tag with the 31888: prefix) was no longer on the relay."))

/* ------------------------------- groups ------------------------------- */

const sug = (sk, d, created_at, extra = []) =>
  sign(sk, {
    kind: 31888,
    tags: [
      ['d', d], ['title', `Post ${d}`], ['type', 'movie'],
      ['r', `https://example.com/${d}`, 'watch'],
      ['a', ADDRESS, RELAY, 'root'], ['p', PK.curator], ['k', '31889'],
      ...extra,
    ],
    content: '',
    created_at,
  })
const can = (d, source, created_at) =>
  sign(KEYS.curator, {
    kind: 31890,
    tags: [
      ['d', d], ['title', `Post ${d}`], ['type', 'movie'],
      ['r', `https://example.com/${d}`, 'watch'],
      ['a', ADDRESS, RELAY, 'root'], ['p', PK.curator], ['k', '31889'],
      ...(source
        ? [['a', `31888:${source.pubkey}:${source.tags.find((t) => t[0] === 'd')[1]}`, '', 'mention'], ['e', source.id, '', 'mention'], ['p', source.pubkey]]
        : []),
    ],
    content: '',
    created_at,
  })

const bobShared = sug(KEYS.bob, 'shared', T0 + 10)
const carolShared = sug(KEYS.carol, 'shared', T0 + 20)
const sharedCanonical = can('shared', bobShared, T0 + 30)
const daveAlone = sug(KEYS.dave, 'alone', T0 + 40)
const erinOriginal = sug(KEYS.erin, 'original', T0 + 50)
const renamedCanonical = can('renamed', erinOriginal, T0 + 60)
const curatorOnly = can('added', null, T0 + 70)

out('group', 'basic', {
  name: 'basic',
  note: 'Suggestions sharing a d form one group; the canonical entry heads it; a canonical whose source has a different d pulls that suggestion in; a curator-added entry is a group of one.',
  schema: SCHEMA,
  events: [bobShared, carolShared, sharedCanonical, daveAlone, erinOriginal, renamedCanonical, curatorOnly],
  groups: [
    {
      identifier: 'added', state: 'curated', head: curatorOnly.id, canonical: curatorOnly.id, suggestions: [],
      coordinates: [`31890:${PK.curator}:added`],
    },
    {
      identifier: 'renamed', state: 'curated', head: renamedCanonical.id, canonical: renamedCanonical.id,
      suggestions: [erinOriginal.id],
      coordinates: [`31890:${PK.curator}:renamed`, `31888:${PK.erin}:original`],
    },
    {
      identifier: 'original', state: 'pending', head: erinOriginal.id, canonical: null, suggestions: [erinOriginal.id],
      coordinates: [`31890:${PK.curator}:original`, `31888:${PK.erin}:original`],
    },
    {
      identifier: 'alone', state: 'pending', head: daveAlone.id, canonical: null, suggestions: [daveAlone.id],
      coordinates: [`31890:${PK.curator}:alone`, `31888:${PK.dave}:alone`],
    },
    {
      identifier: 'shared', state: 'curated', head: sharedCanonical.id, canonical: sharedCanonical.id,
      suggestions: [carolShared.id, bobShared.id],
      coordinates: [`31890:${PK.curator}:shared`, `31888:${PK.carol}:shared`, `31888:${PK.bob}:shared`],
    },
  ],
})

console.error('vectors written; keys:', Object.entries(PK).map(([k, v]) => `${k}=${v.slice(0, 8)}`).join(' '))
