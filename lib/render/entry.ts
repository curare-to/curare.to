import type { Event } from 'nostr-tools/pure'
import {
  CONTENT_TAG,
  fieldTag,
  isSafeUrl,
  type CuratedSchema,
  type FieldDef,
} from '@/lib/protocol/curated'

/* ------------------------------------------------------------------ *
 * Rendering an entry nobody has seen the schema of.
 *
 * bitcoin.mov knows it is showing films. curare.to reads the schema and
 * decides by field *type*: the title field is the post title, the first url
 * field (preferring a `link` marker) is the post link shown as its hostname,
 * any image field is the thumbnail, an enum field is a flair chip, the
 * content field (or any longtext) is the body, and everything else goes in a
 * details table labelled by the field's label. `t` tags are hashtags.
 *
 * Pure and defensive: every string stays a string, and every URL that could
 * reach an href or src is checked with isSafeUrl here, at the point of use,
 * whatever the schema verified.
 * ------------------------------------------------------------------ */

export interface EntryLink {
  url: string
  host: string
  /** The field's label, or its marker, for a button. */
  label: string
}

export interface EntryFlair {
  field: string
  label: string
  value: string
}

export interface EntryDetail {
  field: string
  label: string
  value: string
}

export interface EntryView {
  id: string
  pubkey: string
  createdAt: number
  identifier: string
  title: string
  /** The post's link — the first safe url field, preferring a `link` marker. */
  link: EntryLink | null
  /** Every safe url field, the post link first. */
  links: EntryLink[]
  /** The first safe https image, or null. */
  image: string | null
  flairs: EntryFlair[]
  /** The content-tagged field, else the first longtext. Plain text. */
  body: string | null
  details: EntryDetail[]
  hashtags: string[]
}

/** Every value an event carries for a field, in tag order. */
export function fieldValues(field: FieldDef, event: Pick<Event, 'tags' | 'content'>): string[] {
  const tag = fieldTag(field)
  if (tag === CONTENT_TAG) {
    const content = (event.content ?? '').trim()
    return content ? [content] : []
  }
  const marker = field.config.marker
  return event.tags
    .filter(
      (t) =>
        t[0] === tag &&
        typeof t[1] === 'string' &&
        t[1].trim() !== '' &&
        (marker === undefined || t[2] === marker),
    )
    .map((t) => t[1].trim())
}

/** A hostname to show for a link, without a leading www. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Seconds as h:mm:ss or m:ss. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

/** Read an entry the way the page shows it. Works for suggestions and canonical entries alike. */
export function describeEntry(event: Event, schema: CuratedSchema): EntryView {
  let title = ''
  let identifier = ''
  const links: EntryLink[] = []
  let preferred: EntryLink | null = null
  let image: string | null = null
  const flairs: EntryFlair[] = []
  let body: string | null = null
  let longtext: string | null = null
  const details: EntryDetail[] = []

  for (const field of schema.fields) {
    const tag = fieldTag(field)
    const values = fieldValues(field, event)
    if (values.length === 0) continue

    if (tag === 'd') {
      identifier = values[0]
      continue
    }
    if (tag === 'title') {
      title = values[0]
      continue
    }
    if (tag === 't') continue // hashtags come from the tags directly below

    switch (field.type) {
      case 'url':
        for (const url of values) {
          if (!isSafeUrl(url)) continue
          const link = { url, host: hostOf(url), label: field.label || field.config.marker || field.name }
          links.push(link)
          if (!preferred && field.config.marker === 'link') preferred = link
        }
        break
      case 'image':
        if (!image) {
          const safe = values.find((v) => isSafeUrl(v, true))
          if (safe) image = safe
        }
        break
      case 'enum':
        for (const value of values) flairs.push({ field: field.name, label: field.label, value })
        break
      case 'longtext':
        if (tag === CONTENT_TAG) body = values[0]
        else if (!longtext) longtext = values[0]
        break
      case 'duration': {
        const n = Number(values[0])
        details.push({ field: field.name, label: field.label, value: Number.isFinite(n) ? formatDuration(n) : values[0] })
        break
      }
      default:
        for (const value of values) details.push({ field: field.name, label: field.label, value })
    }
  }

  // The body may live in a `text` or `token` field with the content tag too.
  if (!body) {
    const contentField = schema.fields.find((f) => fieldTag(f) === CONTENT_TAG)
    if (contentField) {
      const content = fieldValues(contentField, event)[0]
      if (content) {
        body = content
        const i = details.findIndex((d) => d.field === contentField.name)
        if (i >= 0) details.splice(i, 1)
      }
    }
  }

  const link = preferred ?? links[0] ?? null
  if (link && links[0] !== link) {
    links.splice(links.indexOf(link), 1)
    links.unshift(link)
  }

  const hashtags = [...new Set(event.tags.filter((t) => t[0] === 't' && typeof t[1] === 'string' && t[1].trim()).map((t) => t[1].trim()))]

  return {
    id: event.id,
    pubkey: event.pubkey,
    createdAt: event.created_at,
    identifier,
    title: title || '(untitled)',
    link,
    links,
    image,
    flairs,
    body: body ?? longtext,
    details,
    hashtags,
  }
}

/** Whether a sub's front page is a card grid (it has an image field) or a list. */
export function hasImageField(schema: CuratedSchema): boolean {
  return schema.fields.some((f) => f.type === 'image')
}

/** The enum fields a front page can filter on. */
export function flairFields(schema: CuratedSchema): FieldDef[] {
  return schema.fields.filter((f) => f.type === 'enum')
}
