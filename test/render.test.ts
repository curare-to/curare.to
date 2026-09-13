import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Event } from 'nostr-tools/pure'
import { parseCuratedSchemaEvent } from '@/lib/protocol/curated'
import { describeEntry, formatDuration, hasImageField, hostOf } from '@/lib/render/entry'

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
