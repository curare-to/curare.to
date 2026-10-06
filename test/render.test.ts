import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { nip19 } from 'nostr-tools'
import type { Event } from 'nostr-tools/pure'
import { CURATED_SCHEMA_KIND, parseCuratedSchemaEvent } from '@/lib/protocol/curated'
import { describeEntry, formatDuration, hasImageField, hostOf } from '@/lib/render/entry'
import { linkifyParts } from '@/lib/render/linkify'

const vector = (dir: string, name: string) =>
  JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'vectors', dir, `${name}.json`), 'utf8'))

describe('describeEntry', () => {
  it("reads the NIP's example suggestion by field type", () => {
    const { schema: schemaEvent, event } = vector('suggestion', 'nip-example')
    const schema = parseCuratedSchemaEvent(schemaEvent)!
    const view = describeEntry(event, schema)

    expect(view.identifier).toBe('imdb:tt2821314')
    expect(view.title).toBe('The Rise and Rise of Bitcoin')
    // No `link` marker in this schema: the first url field is the link.
    expect(view.link).toEqual({ url: 'http://bitcoindoc.com/', host: 'bitcoindoc.com', label: 'Watch / reference URL' })
    expect(view.links.map((l) => l.host)).toEqual(['bitcoindoc.com', 'imdb.com'])
    expect(view.image).toMatch(/^https:\/\/upload\.wikimedia\.org/)
    expect(view.flairs).toEqual([{ field: 'type', label: 'Type', value: 'documentary' }])
    expect(view.body).toMatch(/^Follows programmer Daniel Mross/)
    expect(view.details).toEqual([{ field: 'year', label: 'Year', value: '2014' }])
    expect(view.hashtags).toEqual(['bitcoin', 'documentary'])
    expect(hasImageField(schema)).toBe(true)
  })

  it('drops unsafe urls and images at the point of rendering, whatever the tags say', () => {
    const { schema: schemaEvent, event } = vector('suggestion', 'nip-example')
    const schema = parseCuratedSchemaEvent(schemaEvent)!
    const hostile: Event = {
      ...event,
      tags: event.tags.map((t: string[]) =>
        t[0] === 'r' && t[2] === 'watch'
          ? ['r', 'javascript:alert(1)', 'watch']
          : t[0] === 'image'
            ? ['image', 'http://insecure.example/poster.jpg']
            : t,
      ),
    }
    const view = describeEntry(hostile, schema)
    expect(view.link?.host).toBe('imdb.com')
    expect(view.links).toHaveLength(1)
    expect(view.image).toBeNull()
  })

  it('prefers a url field marked `link`, and formats durations', () => {
    const { schema: schemaEvent } = vector('suggestion', 'nip-example')
    const base = parseCuratedSchemaEvent(schemaEvent)!
    const schema = {
      ...base,
      fields: [
        ...base.fields,
        { name: 'link', type: 'url' as const, required: false, placeholder: '', label: 'Link', config: { tag: 'r', marker: 'link' } },
        { name: 'runtime', type: 'duration' as const, required: false, placeholder: '', label: 'Runtime', config: { tag: 'duration' } },
      ],
    }
    const event: Event = {
      ...vector('suggestion', 'nip-example').event,
      tags: [...vector('suggestion', 'nip-example').event.tags, ['r', 'https://example.org/post', 'link'], ['duration', '5400']],
    }
    const view = describeEntry(event, schema)
    expect(view.link?.host).toBe('example.org')
    expect(view.links[0].host).toBe('example.org')
    expect(view.details).toContainEqual({ field: 'runtime', label: 'Runtime', value: '1:30:00' })
    expect(formatDuration(59)).toBe('0:59')
    expect(formatDuration(3600)).toBe('1:00:00')
    expect(hostOf('https://www.youtube.com/watch?v=x')).toBe('youtube.com')
  })
})

describe('linkifyParts', () => {
  const PK = 'f87cde3b78b9739f7d19b4dfe5f28a532f67f653bb40df147eb29066472ed72e'
  const NPUB = nip19.npubEncode(PK)
  const NADDR = nip19.naddrEncode({ kind: CURATED_SCHEMA_KIND, pubkey: PK, identifier: 'bitcoin.mov' })

  it('links an npub mention to the person', () => {
    expect(linkifyParts(`ask nostr:${NPUB} about it`)).toEqual([
      { kind: 'text', text: 'ask ' },
      { kind: 'ref', href: `/u/${NPUB}/`, label: `${NPUB.slice(0, 12)}…` },
      { kind: 'text', text: ' about it' },
    ])
  })

  it('links an naddr mention to the list it names', () => {
    expect(linkifyParts(`crossposted from nostr:${NADDR}`)).toEqual([
      { kind: 'text', text: 'crossposted from ' },
      { kind: 'ref', href: `/r/${NADDR}/`, label: `${NADDR.slice(0, 12)}…` },
    ])
  })

  it('leaves an naddr for any other kind as text', () => {
    const entry = nip19.naddrEncode({ kind: 31890, pubkey: PK, identifier: 'imdb:tt2821314' })
    const article = nip19.naddrEncode({ kind: 30023, pubkey: PK, identifier: 'why' })
    expect(linkifyParts(`nostr:${entry} nostr:${article}`)).toEqual([
      { kind: 'text', text: `nostr:${entry}` },
      { kind: 'text', text: ' ' },
      { kind: 'text', text: `nostr:${article}` },
    ])
  })

  it('carries the naddr’s relay hints into the link, and keeps unsafe urls as text', () => {
    const hinted = nip19.naddrEncode({
      kind: CURATED_SCHEMA_KIND,
      pubkey: PK,
      identifier: 'bitcoin.mov',
      relays: ['wss://relay.example'],
    })
    expect(linkifyParts(`nostr:${hinted}`)).toEqual([{ kind: 'ref', href: `/r/${hinted}/`, label: `${hinted.slice(0, 12)}…` }])
    expect(linkifyParts('see https://example.org/post and nostr:naddr1nonsense')).toEqual([
      { kind: 'text', text: 'see ' },
      { kind: 'url', url: 'https://example.org/post' },
      { kind: 'text', text: ' and ' },
      { kind: 'text', text: 'nostr:naddr1nonsense' },
    ])
  })
})
