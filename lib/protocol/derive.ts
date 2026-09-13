import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { slug, type CuratedSchema, type CuratedSuggestionValues } from './curated'

/* ------------------------------------------------------------------ *
 * How a post gets its `d`.
 *
 * The copied module derives `d` for bitcoin.mov (IMDb ids, else a title+year
 * slug) and that rule fires only through a `derived` field the site never
 * asks it to fill: every `d` curare.to publishes is passed in explicitly
 * through BuildOptions.identifier. The rules the templates use live here,
 * and each schema records which one it uses in its identifier field's hint
 * as `[rule:<key>]`, so a publishing client that does not know the rule can
 * at least read it, and one that does applies it.
 * ------------------------------------------------------------------ */

export type DeriveRule = 'link-or-title' | 'title-author' | 'external-or-title-year' | 'title'

export const RULES: { key: DeriveRule; label: string; description: string }[] = [
  {
    key: 'link-or-title',
    label: 'The link, else the title and author',
    description: 'A post with a link is identified by the link, so the same link is one post whoever submits it; a text post by its title and its author.',
  },
  {
    key: 'title-author',
    label: 'The title and author',
    description: 'Two people’s same-titled posts are two posts; one person’s is an edit.',
  },
  {
    key: 'external-or-title-year',
    label: 'The external id, else the title and year',
    description: 'A catalogue entry with an external id (imdb:tt…) is one entry however often it is suggested; otherwise the title and year.',
  },
  { key: 'title', label: 'The title', description: 'The same title is the same post, whoever posts it.' },
]

const RULE_MARK = /\[rule:([a-z-]+)\]/

/** The rule a schema records in its identifier field's hint; `title` when it records none. */
export function ruleOf(schema: CuratedSchema): DeriveRule {
  const field = schema.fields.find((f) => (f.config.tag ?? f.name) === 'd')
  const key = RULE_MARK.exec(field?.config.hint ?? '')?.[1]
  return RULES.some((r) => r.key === key) ? (key as DeriveRule) : 'title'
}

/** The hint text that records a rule, for a schema being made. */
export function ruleHint(rule: DeriveRule): string {
  const found = RULES.find((r) => r.key === rule)!
  return `Derived by the client — ${found.label.toLowerCase()}. [rule:${rule}]`
}

const TRACKING = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$|_hs)/i

/**
 * A link in the form the identifier hashes: scheme dropped (http and https
 * are the same page), host lowercased and www-less, default ports gone,
 * tracking parameters removed, the rest of the query kept in order, no
 * fragment, no trailing slash.
 */
export function canonicalUrl(value: string): string | null {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  const port = url.port && url.port !== '80' && url.port !== '443' ? `:${url.port}` : ''
  const params = [...url.searchParams.entries()].filter(([k]) => !TRACKING.test(k))
  params.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const query = params.length > 0 ? `?${new URLSearchParams(params).toString()}` : ''
  const path = url.pathname.replace(/\/+$/, '') || ''
  return `${host}${port}${path}${query}`
}

const hex = (value: string, length: number) => bytesToHex(sha256(new TextEncoder().encode(value))).slice(0, length)

/** The fallback rule: a slug of the title, `untitled` when even that is empty. */
export function slugIdentifier(title: string): string {
  return slug(title) || 'untitled'
}

export interface DeriveInput {
  title: string
  link?: string
  externalId?: string
  year?: string
  pubkey: string
}

export function deriveIdentifier(rule: DeriveRule, input: DeriveInput): string {
  switch (rule) {
    case 'link-or-title': {
      const canonical = input.link ? canonicalUrl(input.link) : null
      if (canonical) return `url:${hex(canonical, 16)}`
      return `${slugIdentifier(input.title).slice(0, 60)}-${hex(input.pubkey, 6)}`
    }
    case 'title-author':
      return `${slugIdentifier(input.title).slice(0, 60)}-${hex(input.pubkey, 6)}`
    case 'external-or-title-year': {
      const external = (input.externalId ?? '').trim().toLowerCase()
      if (external) return external
      const year = (input.year ?? '').trim()
      return slugIdentifier(year ? `${input.title}-${year}` : input.title)
    }
    case 'title':
      return slugIdentifier(input.title)
  }
}

/** Which of a schema's fields feed the rule: the first url, external-id-ish token, and year fields. */
export function deriveInputOf(schema: CuratedSchema, values: CuratedSuggestionValues, pubkey: string): DeriveInput {
  const byTag = (tag: string) => schema.fields.find((f) => (f.config.tag ?? f.name) === tag)
  const titleField = byTag('title')
  const linkField = schema.fields.find((f) => f.type === 'url' && (f.config.marker === 'link' || f.name === 'link')) ?? schema.fields.find((f) => f.type === 'url')
  const externalField = byTag('i') ?? schema.fields.find((f) => f.name === 'externalId')
  const yearField = schema.fields.find((f) => f.type === 'year')
  return {
    title: (titleField ? values[titleField.name] : values.title) ?? '',
    link: linkField ? values[linkField.name] : undefined,
    externalId: externalField ? values[externalField.name] : undefined,
    year: yearField ? values[yearField.name] : undefined,
    pubkey,
  }
}
