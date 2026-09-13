// Copied verbatim from curare-to/bitcoin.mov lib/nostr/curatedSchemaEvent.ts at 5cdf70a9db5fdba34fa23fc78facdc2403f18f7c — never edited here; see docs/decentralized-reddit.md, decision 9.
import type { Event, EventTemplate } from 'nostr-tools/pure'

/* ------------------------------------------------------------------ *
 * The curated-list events — the three kinds this site speaks.
 *
 *   31889  curated schema event      the definition of a list, by its curator
 *   31888  curated suggestion event  a title anyone proposes, in reply to it
 *   31890  curated canonical event   a suggestion the curator signed off on
 *
 * "Curated" is the family name; schema / suggestion / canonical tell them
 * apart. This module defines all three: their shapes, the default schema, and
 * how to build, parse and verify each.
 *
 * A curated schema event describes the form users fill in to suggest a title:
 * which tags a suggestion may carry, what each one means, whether it is
 * required, and what to show while they fill it in. It is itself an
 * addressable event, so the curator can revise it in place — and because it
 * lives on a relay, other clients can render the same form without shipping
 * this repo's code.
 *
 * A suggestion is published as a **reply to the schema event**: it carries the
 * schema's `a` coordinate as its root, so the list is literally the thread of
 * replies to its own schema, and `#a` is the query that fetches it. A
 * canonical event is the same shape again, signed by the curator, pointing
 * back at the suggestion it came from.
 *
 * The namespace is the schema author's **pubkey**: the coordinate
 * `31889:<pubkey>:<d>` fully identifies one schema. There is no global
 * namespace tag to squat, and none is required on suggestions.
 *
 * This module is deliberately dependency-free (type-only imports, and no
 * relative imports at all — Node can't resolve this repo's extensionless ones).
 * That keeps it loadable by plain `node` scripts as well as the Next bundle, so
 * scripts/seed.mjs, scripts/schema.mjs and scripts/verify.mjs check against the
 * exact same definition the browser uses instead of a copy that drifts. Keep it
 * that way: anything imported here has to be importable from both worlds.
 * ------------------------------------------------------------------ */

/** A curated suggestion event: a title anyone proposes, in reply to the schema. */
export const CURATED_SUGGESTION_KIND = 31888

/** A curated schema event: the definition of a list, published by its curator. */
export const CURATED_SCHEMA_KIND = 31889

/**
 * A curated canonical event: the version of a title the curator signed off on.
 *
 * Anyone may suggest; only the pubkey that published the schema may curate.
 * A canonical event is a suggestion the curator has accepted — same fields,
 * same schema rules, but authored by the curator and (usually) pointing back at
 * the suggestion it came from. Addressable like the rest, so re-publishing with
 * the same `d` revises a curation rather than adding a second one.
 */
export const CURATED_CANONICAL_KIND = 31890

export const VIDEO_TYPES = [
  'movie',
  'documentary',
  'short',
  'interview',
  'series',
  'other',
] as const

export type VideoType = (typeof VIDEO_TYPES)[number]

/* --------------------------- visibility ---------------------------- */

/**
 * Who may submit under a schema, and who the entries are meant for.
 *
 * - `public`  — anyone may submit; entries are public.
 * - `closed`  — publicly readable, but only the schema author and the pubkeys
 *               in its `p` tags may submit. A curated list.
 * - `private` — same write rule as `closed`, and clients should not surface
 *               entries to anyone outside that set. (Nostr relays are open, so
 *               this is a client-side convention, not encryption — never put
 *               secrets in a "private" list.)
 */
export const VISIBILITIES = ['public', 'private', 'closed'] as const

export type Visibility = (typeof VISIBILITIES)[number]

/* ----------------------------- fields ------------------------------ */

/**
 * Field value types. Each maps to one validation rule in `checkValue`.
 *
 * - `text`     — single-line string, length-capped.
 * - `longtext` — multi-line string (the event body).
 * - `token`    — short single-word value (no whitespace), e.g. `imdb:tt123`.
 * - `url`      — http(s) URL; `https: true` narrows it to https only.
 * - `image`    — URL that must be https (mixed content is blocked in browsers).
 * - `enum`     — one of `options`.
 * - `year`     — integer year, bounded by `min`/`max`.
 * - `duration` — positive integer seconds, bounded by `min`/`max`.
 * - `number`   — integer, bounded by `min`/`max`.
 */
export const FIELD_TYPES = [
  'text',
  'longtext',
  'token',
  'url',
  'image',
  'enum',
  'year',
  'duration',
  'number',
] as const

export type FieldType = (typeof FIELD_TYPES)[number]

/**
 * Sentinel `tag` value meaning "this field is the event's content body rather
 * than a tag". No bitcoin.mov schema uses a literal tag named `content`.
 */
export const CONTENT_TAG = 'content'

/** Everything about a field beyond name/type/optionality/placeholder. */
export interface FieldConfig {
  /** Tag this field is written to. Defaults to the field name. */
  tag?: string
  /** Tag marker (3rd element), e.g. `["r", url, "watch"]`. */
  marker?: string
  /**
   * For text-ish types: maximum characters after trimming.
   * For `year` / `duration` / `number`: maximum numeric value.
   */
  max?: number
  /** Minimum numeric value (`year` / `duration` / `number` only). */
  min?: number
  /** Allowed values for an `enum` field. */
  options?: string[]
  /** Require https for a `url` field (`image` is https-only regardless). */
  https?: boolean
  /** The tag may appear more than once. */
  repeat?: boolean
  /** Regex source the trimmed value must match end-to-end. */
  pattern?: string
  /** The app fills this in — never prompt for it in a form. */
  derived?: boolean
  /** Helper text shown under the input. */
  hint?: string
}

/** One field a suggestion may (or must) carry. */
export interface FieldDef {
  /** Stable name. Also the key in the form's value map. */
  name: string
  type: FieldType
  required: boolean
  /** Example value shown in an empty input. */
  placeholder: string
  /** Human label for the input. */
  label: string
  config: FieldConfig
}

/* ----------------------------- schema ------------------------------ */

export interface CuratedSchema {
  /** The schema event's `d` tag. */
  identifier: string
  /**
   * The schema author's pubkey (hex) — the namespace. Empty for a schema that
   * has not been published yet; `curatedSchemaAddress` returns null in that case.
   */
  namespace: string
  /** Required, like every event this project publishes. Labels the event. */
  title: string
  /**
   * Required. The list's identity — what people call it. `title` labels the
   * event ("bitcoin.mov suggestion"); `name` is who's publishing it
   * ("bitcoin.mov"). Superseded by `domain` for display when one is set —
   * see `curatedSchemaDisplayName`.
   */
  name: string
  /** Required. What this list is for. */
  description: string
  /** Optional profile image (https only — it gets rendered). */
  profileImageUrl: string | null
  /**
   * Optional domain the list publishes under, e.g. "bitcoin.mov". When set it
   * REPLACES the name everywhere the list is shown.
   *
   * It is a *claim*, not proof: anyone can put any domain in a tag. Confirm it
   * with `verifyDomain` (NIP-05 style) before treating it as an identity.
   */
  domain: string | null
  /** The kind this schema governs. */
  kind: number
  visibility: Visibility
  fields: FieldDef[]
  /**
   * Groups of field names where at least one must be present. Lets a schema
   * say "a watch link OR an IMDb link" without making either one required.
   */
  requireAny: string[][]
  /** Extra pubkeys allowed to submit under a `closed` / `private` schema. */
  authors: string[]
  /**
   * Where the list lives: the relays suggestions and canonical events are
   * published to and read from. Signed into the schema event as `relay` tags,
   * so a client that finds the schema anywhere knows where to send a reply —
   * and can't be misdirected by an unsigned config file. Empty means the
   * schema doesn't say, and a client falls back to its own list.
   */
  relays: string[]
  /** Provenance when parsed off a relay. */
  source?: { id: string; createdAt: number }
}

/**
 * Discovery hashtag kept on suggestions for backwards compatibility. It is
 * **not** the namespace and is not required — the pubkey coordinate is.
 */
export const NAMESPACE_HASHTAG = 'bitcoin'

/* ----------------------------- helpers ----------------------------- */

/** Length caps on the schema event's own identity tags. */
export const CURATED_SCHEMA_CAP = {
  name: 100,
  title: 200,
  description: 500,
  url: 500,
  domain: 253,
} as const

/**
 * Hostname, at least two labels, no scheme/port/path. `normalizeDomain` strips
 * the things people paste around one first, so "https://Bitcoin.MOV/" is
 * accepted and stored as "bitcoin.mov" — lenient on input, strict on what gets
 * kept, because this string stands in for the list's identity.
 */
const DOMAIN_RE =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/

/** Trim the things people paste around a bare hostname. */
export function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '') // scheme
    .replace(/^@/, '') // NIP-05 style leading @
    .replace(/\/.*$/, '') // path
    .replace(/:\d+$/, '') // port
    .replace(/\.$/, '') // trailing root dot
}

export function isValidDomain(value: string): boolean {
  return DOMAIN_RE.test(normalizeDomain(value))
}

/**
 * What to call this list on screen: the domain when it has one, else the name.
 * A domain is the stronger identity — it's the one thing here that can be
 * checked against the outside world (`verifyDomain`).
 */
export function curatedSchemaDisplayName(schema: CuratedSchema): string {
  return schema.domain ?? schema.name
}

/**
 * Confirm a schema's `domain` claim NIP-05 style: the domain must serve
 * `/.well-known/nostr.json?name=_` naming the schema author's pubkey.
 *
 * Opt-in and network-bound — nothing here calls it for you. Until you do, a
 * domain is a self-assigned label, so don't render it as verified.
 */
export async function verifyDomain(schema: CuratedSchema): Promise<boolean> {
  if (!schema.domain || !schema.namespace) return false
  try {
    const url = `https://${schema.domain}/.well-known/nostr.json?name=_`
    const response = await fetch(url)
    if (!response.ok) return false
    const body: unknown = await response.json()
    const names = (body as { names?: Record<string, string> })?.names
    return names?._ === schema.namespace
  } catch {
    return false
  }
}

/** The tag a field writes to (CONTENT_TAG means the event body). */
export function fieldTag(field: FieldDef): string {
  return field.config.tag ?? field.name
}

export function findField(
  schema: CuratedSchema,
  name: string,
): FieldDef | null {
  return schema.fields.find((f) => f.name === name) ?? null
}

/** Fields a form should actually prompt for — derived ones are filled in. */
export function formFields(schema: CuratedSchema): FieldDef[] {
  return schema.fields.filter((f) => !f.config.derived)
}

/** Addressable coordinate of the schema, or null if it isn't published yet. */
export function curatedSchemaAddress(schema: CuratedSchema): string | null {
  if (!schema.namespace) return null
  return `${CURATED_SCHEMA_KIND}:${schema.namespace}:${schema.identifier}`
}

/** May this pubkey submit under this schema? */
export function canSuggest(
  schema: CuratedSchema,
  pubkey: string | null | undefined,
): boolean {
  if (schema.visibility === 'public') return true
  if (!pubkey) return false
  if (schema.namespace && pubkey === schema.namespace) return true
  return schema.authors.includes(pubkey)
}

/**
 * May this pubkey publish curated entries under this schema?
 *
 * Only the pubkey that published the schema. `visibility` decides who may
 * *suggest*; curation is not delegated. (Delegated curators would need their
 * own tag on the schema event — there isn't one yet.)
 */
export function canCurate(
  schema: CuratedSchema,
  pubkey: string | null | undefined,
): boolean {
  return Boolean(pubkey) && Boolean(schema.namespace) && pubkey === schema.namespace
}

/** A websocket relay URL: `wss://` or, for local development, `ws://`. */
export function isRelayUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return (u.protocol === 'wss:' || u.protocol === 'ws:') && u.hostname !== ''
  } catch {
    return false
  }
}

/** True only for http(s) URLs. Blocks javascript:, data:, etc. */
export function isSafeUrl(value: string, httpsOnly = false): boolean {
  try {
    const u = new URL(value)
    if (httpsOnly) return u.protocol === 'https:'
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

/** URL/tag-safe slug for a `d` identifier fallback. */
export function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function trimTo(value: string, max: number | undefined): string {
  const trimmed = value.trim()
  return max && trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

function tagValue(tags: string[][], name: string): string | null {
  const t = tags.find((t) => t[0] === name && typeof t[1] === 'string')
  return t ? t[1] : null
}

function intOrNull(value: string): number | null {
  if (!/^-?\d+$/.test(value.trim())) return null
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : null
}

/**
 * Force the two rules that hold for every bitcoin.mov event, no matter what a
 * schema event off a relay claims: it must carry a `d` tag and a `title`.
 * A schema that omits or relaxes either gets them put back.
 */
export function normalizeCuratedSchema(schema: CuratedSchema): CuratedSchema {
  const fields = schema.fields.slice()

  for (const [tag, fallback] of MANDATORY_FIELDS) {
    const index = fields.findIndex((f) => fieldTag(f) === tag)
    if (index === -1) {
      fields.unshift(fallback)
    } else if (!fields[index].required) {
      fields[index] = { ...fields[index], required: true }
    }
  }

  return { ...schema, fields }
}

/** `d` and `title` definitions used when a schema event leaves them out. */
const MANDATORY_FIELDS: [string, FieldDef][] = [
  [
    'title',
    {
      name: 'title',
      type: 'text',
      required: true,
      placeholder: '',
      label: 'Title',
      config: { max: 200 },
    },
  ],
  [
    'd',
    {
      name: 'identifier',
      type: 'token',
      required: true,
      placeholder: '',
      label: 'Identifier',
      config: { tag: 'd', max: 80, derived: true },
    },
  ],
]

/* --------------------------- the default --------------------------- */

/**
 * The bitcoin.mov suggestion schema. This is the shape every entry in
 * data/seed-films.json satisfies, and the shape the submit form collects —
 * `npm run seed:dry` verifies both against it.
 */
export const DEFAULT_CURATED_SCHEMA: CuratedSchema = normalizeCuratedSchema({
  identifier: 'bitcoin.mov',
  // The curator is whoever signs and publishes this. The app learns that from
  // the signed event it fetches at /.well-known/curare.to/nostr.json, and the
  // scripts from the key they sign with — it is never written into source.
  namespace: '',
  title: 'bitcoin.mov suggestion',
  name: 'bitcoin.mov',
  description:
    'Fields for a bitcoin.mov entry: a Bitcoin movie, documentary, short, ' +
    'interview or series, with at least one link to watch or look it up.',
  // Both left unset on purpose. A `domain` replaces the name wherever the list
  // is shown, so only claim one you actually control and can serve
  // /.well-known/nostr.json from — pass `npm run schema -- --domain=…`.
  profileImageUrl: null,
  domain: null,
  kind: CURATED_SUGGESTION_KIND,
  visibility: 'public',
  requireAny: [['watchUrl', 'imdbUrl']],
  authors: [],
  // Filled in by whoever publishes it (scripts/schema.mjs uses the relays it
  // is publishing to). This module stays free of relay config on purpose.
  relays: [],
  fields: [
    {
      name: 'identifier',
      type: 'token',
      required: true,
      placeholder: 'the-rise-and-rise-of-bitcoin-2014',
      label: 'Identifier',
      config: {
        tag: 'd',
        max: 80,
        derived: true,
        hint: 'Derived from the external id, or the title and year.',
      },
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      placeholder: 'The Rise and Rise of Bitcoin',
      label: 'Title',
      config: { max: 200 },
    },
    {
      name: 'year',
      type: 'year',
      required: false,
      placeholder: '2014',
      label: 'Year',
      config: { min: 1900, max: 2100 },
    },
    {
      name: 'type',
      type: 'enum',
      required: true,
      placeholder: 'documentary',
      label: 'Type',
      config: { options: [...VIDEO_TYPES] },
    },
    {
      name: 'director',
      type: 'text',
      required: false,
      placeholder: 'Nicholas Mross',
      label: 'Director',
      config: { max: 120 },
    },
    {
      name: 'durationSeconds',
      type: 'duration',
      required: false,
      placeholder: '5760',
      label: 'Duration (seconds)',
      config: {
        tag: 'duration',
        min: 1,
        max: 86399,
        hint: 'Optional — stored in seconds; the form asks for minutes.',
      },
    },
    {
      name: 'watchUrl',
      type: 'url',
      required: false,
      placeholder: 'https://youtube.com/watch?v=…',
      label: 'Watch / reference URL',
      config: { tag: 'r', marker: 'watch', max: 500, repeat: true },
    },
    {
      name: 'imdbUrl',
      type: 'url',
      required: false,
      placeholder: 'https://imdb.com/title/tt2821314',
      label: 'IMDb URL',
      config: { tag: 'r', marker: 'imdb', max: 500 },
    },
    {
      name: 'image',
      type: 'image',
      required: false,
      placeholder: 'https://…/poster.jpg',
      label: 'Poster image URL (https)',
      config: { max: 500, hint: 'Optional — a link to a poster or thumbnail.' },
    },
    {
      name: 'externalId',
      type: 'token',
      required: false,
      placeholder: 'imdb:tt2821314',
      label: 'External ID',
      config: {
        tag: 'i',
        max: 60,
        hint: 'Optional — helps dedupe, e.g. imdb:tt2821314',
      },
    },
    {
      name: 'lang',
      type: 'token',
      required: false,
      placeholder: 'en',
      label: 'Language',
      config: {
        max: 60,
        pattern: '[A-Za-z]{2,8}([-_][A-Za-z0-9]{2,8})*',
        hint: 'Optional — ISO code, e.g. en',
      },
    },
    {
      name: 'hashtags',
      type: 'token',
      required: false,
      placeholder: 'bitcoin',
      label: 'Hashtags',
      config: { tag: 't', max: 60, repeat: true, derived: true },
    },
    {
      name: 'description',
      type: 'longtext',
      required: false,
      placeholder: 'Why is this worth watching?',
      label: 'Description / review',
      config: { tag: CONTENT_TAG, max: 4000, hint: 'Optional — plain text.' },
    },
  ],
})

/* --------------------- read: relay → schema ------------------------ */

function parseFieldTag(tag: string[]): FieldDef | null {
  const [, name, type, optionality, placeholder, label, configJson] = tag
  if (typeof name !== 'string' || !name.trim()) return null
  if (!(FIELD_TYPES as readonly string[]).includes(type)) return null

  let config: FieldConfig = {}
  if (typeof configJson === 'string' && configJson.trim()) {
    try {
      const parsed: unknown = JSON.parse(configJson)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        config = parsed as FieldConfig
      }
    } catch {
      // A malformed config blob costs the field its constraints, not its life.
    }
  }

  return {
    name: name.trim(),
    type: type as FieldType,
    required: optionality === 'required',
    placeholder: typeof placeholder === 'string' ? placeholder : '',
    label: typeof label === 'string' && label ? label : name.trim(),
    config,
  }
}

/** A required identity tag: present, non-empty, within its cap. */
function requiredText(
  tags: string[][],
  tag: string,
  label: string,
  cap: number,
  violations: CuratedSchemaViolation[],
): string {
  const value = (tagValue(tags, tag) ?? '').trim()
  if (!value) {
    violations.push({ field: tag, message: `${label} is required.` })
  } else if (value.length > cap) {
    violations.push({
      field: tag,
      message: `${label} must be at most ${cap} characters.`,
    })
  }
  return value
}

/**
 * Read a kind 31889 event, collecting every reason it isn't a usable schema.
 * Shared by `verifyCuratedSchemaEvent` (which wants the reasons) and
 * `parseCuratedSchemaEvent` (which just wants the schema or nothing).
 */
function readSchemaEvent(event: Event): {
  schema: CuratedSchema | null
  violations: CuratedSchemaViolation[]
} {
  const violations: CuratedSchemaViolation[] = []

  if (event.kind !== CURATED_SCHEMA_KIND) {
    return {
      schema: null,
      violations: [
        { field: 'kind', message: `Expected kind ${CURATED_SCHEMA_KIND}, got ${event.kind}.` },
      ],
    }
  }

  const tags = Array.isArray(event.tags) ? event.tags : []

  const identifier = requiredText(tags, 'd', 'Identifier', CURATED_SCHEMA_CAP.name, violations)
  const title = requiredText(tags, 'title', 'Title', CURATED_SCHEMA_CAP.title, violations)
  const name = requiredText(tags, 'name', 'Name', CURATED_SCHEMA_CAP.name, violations)

  // Description lives in the `description` tag; `content` mirrors it so that
  // generic Nostr clients show something useful. Tag wins, content is fallback.
  const described = (tagValue(tags, 'description') ?? event.content ?? '').trim()
  if (!described) {
    violations.push({ field: 'description', message: 'Description is required.' })
  } else if (described.length > CURATED_SCHEMA_CAP.description) {
    violations.push({
      field: 'description',
      message: `Description must be at most ${CURATED_SCHEMA_CAP.description} characters.`,
    })
  }

  // Visibility is mandatory and never guessed: a list that doesn't say who may
  // submit to it is not a list we're prepared to act on.
  const rawVisibility = (tagValue(tags, 'visibility') ?? '').trim().toLowerCase()
  if (!rawVisibility) {
    violations.push({ field: 'visibility', message: 'Visibility is required.' })
  } else if (!(VISIBILITIES as readonly string[]).includes(rawVisibility)) {
    violations.push({
      field: 'visibility',
      message: `Visibility must be one of: ${VISIBILITIES.join(', ')}.`,
    })
  }

  // Optional identity. A malformed one is dropped, not fatal — but a bad
  // `domain` is reported, because silently ignoring it would show the name
  // where the publisher expected their domain.
  const rawPicture = (tagValue(tags, 'picture') ?? '').trim()
  let profileImageUrl: string | null = null
  if (rawPicture) {
    if (isSafeUrl(rawPicture, true) && rawPicture.length <= CURATED_SCHEMA_CAP.url) {
      profileImageUrl = rawPicture
    } else {
      violations.push({
        field: 'picture',
        message: 'Profile image must be an https URL.',
      })
    }
  }

  const rawDomain = (tagValue(tags, 'domain') ?? '').trim()
  let domain: string | null = null
  if (rawDomain) {
    if (isValidDomain(rawDomain)) {
      domain = normalizeDomain(rawDomain)
    } else {
      violations.push({
        field: 'domain',
        message: `"${rawDomain}" is not a valid domain name.`,
      })
    }
  }

  const fields = tags
    .filter((t) => t[0] === 'field')
    .map(parseFieldTag)
    .filter((f): f is FieldDef => f !== null)
  if (fields.length === 0) {
    violations.push({
      field: 'field',
      message: 'A schema must define at least one field.',
    })
  }

  if (violations.length > 0) return { schema: null, violations }

  const requireAny = tags
    .filter((t) => t[0] === 'require-any')
    .map((t) => t.slice(1).filter((n) => typeof n === 'string' && n.trim()))
    .filter((group) => group.length > 1)

  const authors = tags
    .filter((t) => t[0] === 'p' && typeof t[1] === 'string')
    .map((t) => t[1])

  // A relay the schema names is where replies go, so a malformed one is worth
  // refusing the schema over: the alternative is a client that silently can't
  // publish.
  const relays: string[] = []
  for (const t of tags) {
    if (t[0] !== 'relay' || typeof t[1] !== 'string') continue
    const url = t[1].trim()
    if (!isRelayUrl(url)) {
      violations.push({ field: 'relay', message: `"${url}" is not a ws:// or wss:// relay URL.` })
      continue
    }
    if (!relays.includes(url)) relays.push(url)
  }
  if (violations.length > 0) return { schema: null, violations }

  const schema = normalizeCuratedSchema({
    identifier,
    namespace: event.pubkey,
    title,
    name,
    description: described,
    profileImageUrl,
    domain,
    kind: intOrNull(tagValue(tags, 'k') ?? '') ?? CURATED_SUGGESTION_KIND,
    visibility: rawVisibility as Visibility,
    fields,
    requireAny,
    authors,
    relays,
    source: { id: event.id, createdAt: event.created_at },
  })

  return { schema, violations }
}

/**
 * Check a kind 31889 event and say what's wrong with it. Use this when someone
 * needs the reason (publishing, auditing); use `parseCuratedSchemaEvent` when you just
 * want a schema you can trust.
 */
export function verifyCuratedSchemaEvent(event: Event): CuratedSchemaVerification {
  const { violations } = readSchemaEvent(event)
  return { ok: violations.length === 0, violations }
}

/**
 * Parse a kind 31889 event into a schema, or null if it isn't a usable one.
 * Like `parseSuggestion`, this is defensive: relays hand us partial and hostile
 * events, and a schema that can't be trusted is worse than no schema at all.
 */
export function parseCuratedSchemaEvent(event: Event): CuratedSchema | null {
  return readSchemaEvent(event).schema
}

/* -------------------- write: schema → relay ------------------------ */

/** Build the unsigned kind 31889 event that publishes a schema. */
export function buildCuratedSchemaTemplate(
  schema: CuratedSchema,
  createdAt = Math.floor(Date.now() / 1000),
): EventTemplate {
  const normalized = normalizeCuratedSchema(schema)
  const tags: string[][] = [
    ['d', normalized.identifier],
    ['title', normalized.title],
    ['name', normalized.name],
    ['description', normalized.description],
    ['k', String(normalized.kind)],
    ['visibility', normalized.visibility],
  ]

  if (normalized.profileImageUrl) tags.push(['picture', normalized.profileImageUrl])
  if (normalized.domain) tags.push(['domain', normalizeDomain(normalized.domain)])

  for (const field of normalized.fields) {
    tags.push([
      'field',
      field.name,
      field.type,
      field.required ? 'required' : 'optional',
      field.placeholder,
      field.label,
      JSON.stringify(field.config),
    ])
  }

  for (const group of normalized.requireAny) tags.push(['require-any', ...group])
  for (const pubkey of normalized.authors) tags.push(['p', pubkey])
  for (const relay of normalized.relays) tags.push(['relay', relay])

  return {
    kind: CURATED_SCHEMA_KIND,
    created_at: createdAt,
    tags,
    // Mirrors the `description` tag so generic Nostr clients — which read
    // content, not our tags — show something useful. The tag is authoritative.
    content: normalized.description,
  }
}

/* ------------------ write: values → suggestion --------------------- */

/** A form's collected values, keyed by field name. */
export type CuratedSuggestionValues = Record<string, string>

export interface BuildOptions {
  /** Reuse an existing entry's `d` so this event replaces it. */
  identifier?: string
  /** Unix seconds; defaults to now. */
  createdAt?: number
}

/**
 * Deterministic `d` for a suggestion: the external id when given (so "the same
 * film" stays one editable entry across edits), else a title+year slug.
 */
export function deriveIdentifier(values: CuratedSuggestionValues): string {
  const ext = (values.externalId ?? '').trim().toLowerCase()
  if (ext) return ext
  const year = intOrNull(values.year ?? '')
  const title = (values.title ?? '').trim()
  const inRange = year !== null && year >= 1900 && year <= 2100
  return slug(inRange ? `${title}-${year}` : title) || 'untitled'
}

/** Derived tag values the app fills in rather than prompting for. */
function derivedValues(
  field: FieldDef,
  values: CuratedSuggestionValues,
  options: BuildOptions,
): string[] {
  switch (fieldTag(field)) {
    case 'd':
      return [options.identifier?.trim() || deriveIdentifier(values)]
    case 't': {
      // Discovery hashtags: the legacy namespace tag, plus the entry's type.
      const type = (values.type ?? '').trim().toLowerCase()
      return type ? [NAMESPACE_HASHTAG, type] : [NAMESPACE_HASHTAG]
    }
    default:
      return []
  }
}

/**
 * The tags that make a suggestion a *reply* to its schema event.
 *
 * The root is the schema's `a` coordinate rather than an `e` event id: kind
 * 31889 is addressable, so revising the schema mints a new event id but keeps
 * the coordinate. Pinning an id would orphan every suggestion the moment the
 * schema was edited.
 *
 * `p` notifies the schema's author and `k` names the kind being replied to,
 * per the usual reply conventions. Neither is load-bearing — `a` is what
 * `verifyCuratedSuggestion` requires and what relays are queried on (`#a`).
 *
 * An unpublished schema has no coordinate to reply to, so this is empty for
 * a schema with no `namespace` — the bundled default, before publishing.
 */
export function replyTags(schema: CuratedSchema): string[][] {
  const address = curatedSchemaAddress(schema)
  if (!address) return []
  // The third element is the NIP-10 relay hint: where a reader who doesn't
  // already know this list can go to find the schema being replied to.
  return [
    ['a', address, schema.relays[0] ?? '', 'root'],
    ['p', schema.namespace],
    ['k', String(CURATED_SCHEMA_KIND)],
  ]
}

/**
 * Build the unsigned suggestion event from a form's values, using the schema
 * as the tag layout, and address it as a reply to the schema event.
 *
 * The result is guaranteed to satisfy `verifyCuratedSuggestion` against the same
 * schema (given values that pass `validateValues`) — the read and write sides
 * cannot drift, because both walk this one field list.
 */
export function buildCuratedSuggestionTemplate(
  values: CuratedSuggestionValues,
  schema: CuratedSchema = DEFAULT_CURATED_SCHEMA,
  options: BuildOptions = {},
): EventTemplate {
  const { tags, content } = fieldTags(values, schema, options)
  tags.push(...replyTags(schema))

  return {
    kind: schema.kind,
    created_at: options.createdAt ?? Math.floor(Date.now() / 1000),
    tags,
    content,
  }
}

/**
 * Lay a form's values out as tags, per the schema's field list. Shared by the
 * suggestion and curation builders so a curated entry is the same shape as the
 * suggestion it came from, and both answer to the same verifier.
 */
function fieldTags(
  values: CuratedSuggestionValues,
  schema: CuratedSchema,
  options: BuildOptions,
): { tags: string[][]; content: string } {
  const tags: string[][] = []
  let content = ''

  for (const field of schema.fields) {
    const tag = fieldTag(field)
    const raw = field.config.derived
      ? derivedValues(field, values, options)
      : [values[field.name] ?? '']

    for (const value of raw) {
      const clipped = trimTo(value, textCap(field))
      if (!clipped) continue
      if (tag === CONTENT_TAG) {
        content = clipped
        continue
      }
      tags.push(
        field.config.marker ? [tag, clipped, field.config.marker] : [tag, clipped],
      )
      if (!field.config.repeat) break
    }
  }

  return { tags, content }
}

/**
 * Split an addressable coordinate `<kind>:<pubkey>:<d>`.
 *
 * Only the first two colons separate: a `d` identifier may itself contain them
 * (ours do — "imdb:tt2821314"), so a naive split mangles the identifier and
 * miscounts the parts.
 */
export function parseCoordinate(
  value: string,
): { kind: number; pubkey: string; identifier: string } | null {
  const match = /^(\d{1,5}):([0-9a-f]{64}):(.+)$/i.exec(value.trim())
  if (!match) return null
  return {
    kind: Number(match[1]),
    pubkey: match[2].toLowerCase(),
    identifier: match[3],
  }
}

/** Where a curated entry came from: the suggestion the curator accepted. */
export interface CuratedSuggestionRef {
  /** Event id of the exact version curated — provenance, pinned. */
  id: string
  /** Coordinate `31888:<pubkey>:<d>`, which follows the suggester's edits. */
  address: string
  /** The suggester, credited with a `p` tag. */
  pubkey: string
}

/** Describe a suggestion event so a curated entry can point back at it. */
export function curatedSuggestionRef(
  event: { id: string; pubkey: string; tags: string[][] },
  schema: CuratedSchema = DEFAULT_CURATED_SCHEMA,
): CuratedSuggestionRef | null {
  const tags = Array.isArray(event.tags) ? event.tags : []
  const d = (tags.find((t) => t[0] === 'd' && typeof t[1] === 'string')?.[1] ?? '').trim()
  if (!d || !event.pubkey) return null
  return {
    id: event.id,
    pubkey: event.pubkey,
    address: `${schema.kind}:${event.pubkey}:${d}`,
  }
}

/** Read the source reference back off a curated entry. */
export function curatedCanonicalSource(
  event: CuratedSuggestionLike,
  schema: CuratedSchema = DEFAULT_CURATED_SCHEMA,
): CuratedSuggestionRef | null {
  const tags = Array.isArray(event.tags) ? event.tags : []
  const address = tags.find(
    (t) => t[0] === 'a' && typeof t[1] === 'string' && t[1].startsWith(`${schema.kind}:`),
  )?.[1]
  const coordinate = address ? parseCoordinate(address) : null
  if (!address || !coordinate) return null
  const id = tags.find((t) => t[0] === 'e' && typeof t[1] === 'string')?.[1] ?? ''
  return { id, address, pubkey: coordinate.pubkey }
}

/** Both tags: the coordinate (follows edits) and the id (pins what was seen). */
function sourceTags(source: CuratedSuggestionRef | null): string[][] {
  if (!source) return []
  const tags: string[][] = [['a', source.address, '', 'mention']]
  if (source.id) tags.push(['e', source.id, '', 'mention'])
  if (source.pubkey) tags.push(['p', source.pubkey])
  return tags
}

/**
 * Build the unsigned curated entry. Same field layout as a suggestion and the
 * same reply-to-schema root — a curated entry *is* an entry — plus a reference
 * to the suggestion it came from.
 *
 * `values` rather than the source event, because curating is editorial: the
 * curator can fix the year or swap the poster on the way through. Pass
 * `options.identifier` to keep the suggestion's `d`, so the curated entry
 * lands on the same coordinate every time it's revised.
 *
 * `source` is optional — a curator may add an entry nobody suggested.
 */
export function buildCuratedCanonicalTemplate(
  values: CuratedSuggestionValues,
  schema: CuratedSchema = DEFAULT_CURATED_SCHEMA,
  source: CuratedSuggestionRef | null = null,
  options: BuildOptions = {},
): EventTemplate {
  const { tags, content } = fieldTags(values, schema, options)
  tags.push(...replyTags(schema))
  tags.push(...sourceTags(source))

  return {
    kind: CURATED_CANONICAL_KIND,
    created_at: options.createdAt ?? Math.floor(Date.now() / 1000),
    tags,
    content,
  }
}

/**
 * Read a schema-valid event back into the values that would rebuild it — the
 * reverse of `fieldTags`. Lets the curator take a suggestion off a relay,
 * adjust it, and republish it as a curated entry without the app's parsing
 * layer, which plain Node can't import.
 */
export function eventToValues(
  event: CuratedSuggestionLike,
  schema: CuratedSchema = DEFAULT_CURATED_SCHEMA,
): CuratedSuggestionValues {
  const subject: CuratedSuggestionLike = {
    ...event,
    tags: Array.isArray(event.tags) ? event.tags : [],
  }
  const values: CuratedSuggestionValues = {}
  for (const field of schema.fields) {
    const found = valuesOf(field, subject)
    if (found.length > 0) values[field.name] = found[0]
  }
  return values
}

/** `max` caps characters for text-ish fields and numbers for numeric ones. */
function textCap(field: FieldDef): number | undefined {
  return field.type === 'year' ||
    field.type === 'duration' ||
    field.type === 'number'
    ? undefined
    : field.config.max
}

/* ---------------------------- verify ------------------------------- */

export interface CuratedSchemaViolation {
  /**
   * The offending field's name, or a schema-level rule (`kind`, `schema`,
   * `visibility`). For a `require-any` group it is the group's first field, so
   * a form can show the message inline.
   */
  field: string
  message: string
}

export interface CuratedSchemaVerification {
  ok: boolean
  violations: CuratedSchemaViolation[]
}

/** Anything with the shape of a suggestion — a signed event or a template. */
export interface CuratedSuggestionLike {
  kind: number
  tags: string[][]
  content: string
  pubkey?: string
}

/** Validate one value against a field's type and constraints. */
export function checkValue(field: FieldDef, value: string): string | null {
  const v = value.trim()
  const { max, min, options, pattern } = field.config
  if (!v) return `${field.label} must not be empty.`

  switch (field.type) {
    case 'text':
    case 'longtext':
      break
    case 'token':
      if (/\s/.test(v)) return `${field.label} must be a single word.`
      break
    case 'url':
      if (!isSafeUrl(v, field.config.https))
        return field.config.https
          ? `${field.label} must be an https URL.`
          : `${field.label} must be a valid http(s) URL.`
      break
    case 'image':
      if (!isSafeUrl(v, true)) return `${field.label} must be an https URL.`
      break
    case 'enum':
      if (!options?.includes(v))
        return `${field.label} must be one of: ${(options ?? []).join(', ')}.`
      break
    case 'year':
    case 'duration':
    case 'number': {
      const n = intOrNull(v)
      if (n === null) return `${field.label} must be a whole number.`
      if (field.type === 'duration' && n <= 0)
        return `${field.label} must be a positive number of seconds.`
      if (min !== undefined && n < min)
        return `${field.label} must be at least ${min}.`
      if (max !== undefined && n > max)
        return `${field.label} must be at most ${max}.`
      return null // numeric `max` is a bound, not a length cap
    }
  }

  if (max !== undefined && v.length > max)
    return `${field.label} must be at most ${max} characters.`
  if (pattern && !new RegExp(`^(?:${pattern})$`).test(v))
    return `${field.label} is not in the expected format.`
  return null
}

/** Every value a field holds in an event (its tags, or the content body). */
function valuesOf(field: FieldDef, event: CuratedSuggestionLike): string[] {
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
    .map((t) => t[1])
}

/**
 * Verify a suggestion against a schema. This is the gate: an event that does
 * not match is rejected rather than shown, on the way in from a relay and on
 * the way out to one.
 *
 * Unknown tags are permitted — other clients legitimately add their own — but
 * every field the schema *does* define is checked, and `d` and `title` are
 * always required (see `normalizeCuratedSchema`).
 *
 * Pass `pubkey` when verifying an unsigned template, so a non-public schema
 * can still check who is about to sign it.
 */
export function verifyCuratedSuggestion(
  event: CuratedSuggestionLike,
  schema: CuratedSchema = DEFAULT_CURATED_SCHEMA,
  options: { pubkey?: string } = {},
): CuratedSchemaVerification {
  return verifyEntry(event, schema, schema.kind, options)
}

/**
 * Verify a *curated* entry. Same fields and the same reply-to-schema root as a
 * suggestion — a curated entry is an entry, not an annotation — with two rules
 * on top:
 *
 * 1. it is kind 31890, and
 * 2. it is signed by the pubkey that published the schema. Curation is the one
 *    power the schema author does not share; `visibility` governs who may
 *    *suggest*, and has no bearing here.
 *
 * The reference back to the suggestion it came from is optional: a curator may
 * add an entry nobody suggested. When present it must be well formed.
 */
export function verifyCuratedCanonical(
  event: CuratedSuggestionLike,
  schema: CuratedSchema = DEFAULT_CURATED_SCHEMA,
  options: { pubkey?: string } = {},
): CuratedSchemaVerification {
  const result = verifyEntry(event, schema, CURATED_CANONICAL_KIND, options)
  const violations = [...result.violations]
  const tags = Array.isArray(event.tags) ? event.tags : []

  const author = options.pubkey ?? event.pubkey
  if (!schema.namespace) {
    violations.push({
      field: 'curator',
      message: 'This schema has no published author, so nothing can be curated under it.',
    })
  } else if (!author) {
    violations.push({ field: 'curator', message: 'A curated entry needs a known author.' })
  } else if (!canCurate(schema, author)) {
    violations.push({
      field: 'curator',
      message: 'Only the pubkey that published the schema may curate.',
    })
  }

  // A malformed source reference is worse than none: it credits the wrong
  // person, or points at an entry that was never suggested.
  const source = tags.find(
    (t) => t[0] === 'a' && typeof t[1] === 'string' && t[1].startsWith(`${schema.kind}:`),
  )
  if (source && !parseCoordinate(source[1])) {
    violations.push({
      field: 'source',
      message: `"${source[1]}" is not a valid suggestion coordinate.`,
    })
  }

  return { ok: violations.length === 0, violations }
}

/** Shared field/reply checking for both suggestions and curated entries. */
function verifyEntry(
  event: CuratedSuggestionLike,
  schema: CuratedSchema,
  expectedKind: number,
  options: { pubkey?: string },
): CuratedSchemaVerification {
  const violations: CuratedSchemaViolation[] = []
  const tags = Array.isArray(event.tags) ? event.tags : []
  const subject: CuratedSuggestionLike = { ...event, tags }

  if (event.kind !== expectedKind) {
    violations.push({
      field: 'kind',
      message: `Expected kind ${expectedKind}, got ${event.kind}.`,
    })
  }

  // A suggestion is a reply to its schema, so the root `a` tag is required —
  // but only once the schema has a coordinate to reply to. An unpublished
  // schema (no `namespace`) has nothing to point at, so suggestions made
  // before it was published stay valid until it is. Only schema coordinates
  // count here; entries carry `a` tags for other reasons too.
  const address = curatedSchemaAddress(schema)
  if (address) {
    const roots = tags
      .filter((t) => t[0] === 'a' && typeof t[1] === 'string')
      .map((t) => t[1])
      .filter((value) => value.startsWith(`${CURATED_SCHEMA_KIND}:`))
    if (roots.length === 0) {
      violations.push({
        field: 'schema',
        message: `A suggestion must reply to its schema (${address}).`,
      })
    } else if (!roots.includes(address)) {
      violations.push({
        field: 'schema',
        message: `Suggestion replies to ${roots[0]}, not ${address}.`,
      })
    }
  }

  for (const field of schema.fields) {
    const values = valuesOf(field, subject)

    if (values.length === 0) {
      if (field.required)
        violations.push({
          field: field.name,
          message: `${field.label} is required.`,
        })
      continue
    }

    if (values.length > 1 && !field.config.repeat) {
      violations.push({
        field: field.name,
        message: `${field.label} may only appear once.`,
      })
    }

    for (const value of values) {
      const error = checkValue(field, value)
      if (error) {
        violations.push({ field: field.name, message: error })
        break // one message per field is enough
      }
    }
  }

  for (const group of schema.requireAny) {
    const satisfied = group.some((name) => {
      const field = findField(schema, name)
      return field ? valuesOf(field, subject).length > 0 : false
    })
    if (!satisfied) {
      violations.push({ field: group[0], message: requireAnyMessage(schema, group) })
    }
  }

  const author = options.pubkey ?? event.pubkey
  if (schema.visibility !== 'public') {
    if (!author) {
      violations.push({
        field: 'visibility',
        message: `A ${schema.visibility} schema needs a known author.`,
      })
    } else if (!canSuggest(schema, author)) {
      violations.push({
        field: 'visibility',
        message: `This list is ${schema.visibility} — that key may not submit to it.`,
      })
    }
  }

  return { ok: violations.length === 0, violations }
}

function requireAnyMessage(schema: CuratedSchema, group: string[]): string {
  const labels = group.map((name) => findField(schema, name)?.label ?? name)
  return `Provide at least one of: ${labels.join(', ')}.`
}

/* ------------------------- verify: form ---------------------------- */

/**
 * Validate a form's values before we bother the signer extension. Same rules
 * as `verifyCuratedSuggestion`, minus the derived fields the app fills in itself.
 */
export function validateValues(
  values: CuratedSuggestionValues,
  schema: CuratedSchema = DEFAULT_CURATED_SCHEMA,
  options: { pubkey?: string } = {},
): Record<string, string> {
  const errors: Record<string, string> = {}

  for (const field of formFields(schema)) {
    const value = (values[field.name] ?? '').trim()
    if (!value) {
      if (field.required) errors[field.name] = `${field.label} is required.`
      continue
    }
    const error = checkValue(field, value)
    if (error) errors[field.name] = error
  }

  for (const group of schema.requireAny) {
    const satisfied = group.some((name) => (values[name] ?? '').trim() !== '')
    if (!satisfied && !errors[group[0]]) {
      errors[group[0]] = requireAnyMessage(schema, group)
    }
  }

  if (!canSuggest(schema, options.pubkey)) {
    errors.visibility = options.pubkey
      ? `This list is ${schema.visibility} — your key may not submit to it.`
      : `This list is ${schema.visibility} — connect an authorised key to submit.`
  }

  return errors
}

/**
 * Label / placeholder / hint / required for one input, with safe fallbacks so
 * a form can't crash on a schema that omits the field.
 */
export function fieldProps(
  schema: CuratedSchema,
  name: string,
): { label: string; placeholder: string; hint?: string; required: boolean } {
  const field = findField(schema, name)
  if (!field) return { label: name, placeholder: '', required: false }
  return {
    label: field.label,
    placeholder: field.placeholder,
    hint: field.config.hint,
    required: field.required || schema.requireAny.some((g) => g[0] === name),
  }
}
