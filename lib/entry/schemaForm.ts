import type { Event } from 'nostr-tools/pure'
import {
  buildCuratedSchemaTemplate,
  CURATED_SUGGESTION_KIND,
  isRelayUrl,
  normalizeDomain,
  slug,
  verifyCuratedSchemaEvent,
  type CuratedSchema,
  type FieldDef,
  type FieldType,
  type Visibility,
} from '@/lib/protocol/curated'
import { ruleHint, ruleOf, type DeriveRule } from '@/lib/protocol/derive'
import { identifierField, type SchemaTemplate } from '@/lib/protocol/templates'
import { parsePubkey } from '@/lib/routes'

/* ------------------------------------------------------------------ *
 * The sub editor's logic, without the editor: a draft, what is wrong with
 * it, and the schema it becomes. The mandatory d and title fields cannot be
 * removed; verifyCuratedSchemaEvent judges the rest, on every change.
 * ------------------------------------------------------------------ */

export interface SchemaDraft {
  /** The schema's `d`; derived from the name until set, locked when editing. */
  identifier: string
  title: string
  name: string
  description: string
  picture: string
  domain: string
  visibility: Visibility
  /** Additional suggesters, hex. */
  authors: string[]
  relays: string[]
  fields: FieldDef[]
  requireAny: string[][]
  rule: DeriveRule
}

export const FIELD_TYPES: { key: FieldType; label: string }[] = [
  { key: 'text', label: 'Text (one line)' },
  { key: 'longtext', label: 'Text (many lines)' },
  { key: 'token', label: 'Token (one word)' },
  { key: 'url', label: 'Link' },
  { key: 'image', label: 'Image (https)' },
  { key: 'enum', label: 'One of a list' },
  { key: 'year', label: 'Year' },
  { key: 'duration', label: 'Duration (seconds)' },
  { key: 'number', label: 'Number' },
]

export function draftFromTemplate(template: SchemaTemplate): SchemaDraft {
  return {
    identifier: '',
    title: '',
    name: '',
    description: '',
    picture: '',
    domain: '',
    visibility: 'public',
    authors: [],
    relays: [],
    fields: template.fields.map((f) => ({ ...f, config: { ...f.config } })),
    requireAny: template.requireAny.map((g) => [...g]),
    rule: template.rule,
  }
}

export function draftFromSchema(schema: CuratedSchema): SchemaDraft {
  return {
    identifier: schema.identifier,
    title: schema.title,
    name: schema.name,
    description: schema.description,
    picture: schema.profileImageUrl ?? '',
    domain: schema.domain ?? '',
    visibility: schema.visibility,
    authors: [...schema.authors],
    relays: [...schema.relays],
    fields: schema.fields.map((f) => ({ ...f, config: { ...f.config } })),
    requireAny: schema.requireAny.map((g) => [...g]),
    rule: ruleOf(schema),
  }
}

/** The identifier a draft publishes under: its own, else the name's slug. */
export function draftIdentifier(draft: SchemaDraft): string {
  return draft.identifier.trim() || slug(draft.name) || ''
}

/** The schema a draft describes, for `namespace` — the key that will sign it. */
export function draftToSchema(draft: SchemaDraft, namespace: string): CuratedSchema {
  const fields = draft.fields.map((f) => {
    if ((f.config.tag ?? f.name) !== 'd') return f
    // The d field is the site's: derived, with the rule recorded in its hint.
    return { ...identifierField(draft.rule), name: f.name || 'identifier', label: f.label || 'Identifier' }
  })
  const domain = normalizeDomain(draft.domain)
  return {
    identifier: draftIdentifier(draft),
    namespace,
    title: draft.title.trim() || (draft.name.trim() ? `${draft.name.trim()} suggestion` : ''),
    name: draft.name.trim(),
    description: draft.description.trim(),
    profileImageUrl: draft.picture.trim() || null,
    domain: domain || null,
    kind: CURATED_SUGGESTION_KIND,
    visibility: draft.visibility,
    fields,
    requireAny: draft.requireAny.filter((g) => g.length > 0),
    authors: draft.authors,
    relays: [...new Set(draft.relays.map((r) => r.trim()).filter(Boolean))],
  }
}

export interface DraftProblem {
  field: string
  message: string
  /** A warning does not block publishing. */
  warning?: boolean
}

/** What is wrong with a draft, from the module's verifier plus the editor's own rules. */
export function validateDraft(draft: SchemaDraft, options: { production: boolean; namespace?: string; allowInsecure?: readonly string[] }): DraftProblem[] {
  const problems: DraftProblem[] = []
  const namespace = options.namespace ?? '0'.repeat(64)
  const schema = draftToSchema(draft, namespace)
  const template = buildCuratedSchemaTemplate(schema, 1)
  const event: Event = { ...template, id: '', pubkey: namespace, sig: '' }
  for (const v of verifyCuratedSchemaEvent(event).violations) problems.push({ field: v.field, message: v.message })

  for (const relay of draft.relays) {
    const trimmed = relay.trim()
    if (!trimmed) continue
    if (!isRelayUrl(trimmed)) problems.push({ field: 'relay', message: `"${trimmed}" is not a ws:// or wss:// relay URL.` })
    else if (options.production && trimmed.startsWith('ws://') && !(options.allowInsecure ?? []).includes(trimmed))
      problems.push({ field: 'relay', message: `"${trimmed}" is insecure; a browser on an https page cannot connect to ws://. Use wss://.` })
  }
  if (schema.relays.length === 0) problems.push({ field: 'relay', message: 'Name at least one relay, or readers fall back to whatever relays they use.', warning: true })

  for (const pubkey of draft.authors) {
    if (!parsePubkey(pubkey)) problems.push({ field: 'authors', message: `"${pubkey.slice(0, 12)}…" is not a pubkey.` })
  }
  if (draft.visibility !== 'public' && draft.authors.length === 0) {
    problems.push({ field: 'authors', message: `A ${draft.visibility} list with no other pubkeys accepts suggestions from you alone.`, warning: true })
  }

  const names = draft.fields.map((f) => f.name.trim())
  for (const [i, name] of names.entries()) {
    if (!name) problems.push({ field: `field.${i}`, message: `Field ${i + 1} needs a name.` })
    else if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) problems.push({ field: `field.${i}`, message: `"${name}" is not a field name: letters, digits, - and _.` })
    else if (names.indexOf(name) !== i) problems.push({ field: `field.${i}`, message: `Two fields are named "${name}".` })
    const f = draft.fields[i]
    if (f.type === 'enum' && !(f.config.options?.length)) problems.push({ field: `field.${i}`, message: `"${name || `field ${i + 1}`}" needs its options.` })
    if (f.config.pattern) {
      try {
        new RegExp(`^(?:${f.config.pattern})$`, 'u')
      } catch {
        problems.push({ field: `field.${i}`, message: `"${name}" has a pattern that is not a regular expression.` })
      }
    }
  }
  for (const group of draft.requireAny) {
    for (const member of group) {
      if (!names.includes(member)) problems.push({ field: 'requireAny', message: `"${member}" in a require-any group is not a field.` })
    }
  }
  return problems
}

export function isLocked(field: FieldDef): boolean {
  const tag = field.config.tag ?? field.name
  return tag === 'd' || tag === 'title'
}

/** Remove a field — never d or title. */
export function removeField(draft: SchemaDraft, index: number): SchemaDraft {
  const field = draft.fields[index]
  if (!field || isLocked(field)) return draft
  const name = field.name
  return {
    ...draft,
    fields: draft.fields.filter((_, i) => i !== index),
    requireAny: draft.requireAny.map((g) => g.filter((n) => n !== name)).filter((g) => g.length > 0),
  }
}

export function addField(draft: SchemaDraft, type: FieldType = 'text'): SchemaDraft {
  const base: string = type
  let name: string = base
  let n = 2
  while (draft.fields.some((f) => f.name === name)) name = `${base}${n++}`
  const config = type === 'enum' ? { options: ['a', 'b'] } : type === 'url' ? { tag: 'r', marker: name, max: 500 } : type === 'longtext' ? { max: 4000 } : { max: 200 }
  return { ...draft, fields: [...draft.fields, { name, type, required: false, placeholder: '', label: name, config }] }
}

export function moveField(draft: SchemaDraft, from: number, to: number): SchemaDraft {
  if (from === to || from < 0 || to < 0 || from >= draft.fields.length || to >= draft.fields.length) return draft
  const fields = [...draft.fields]
  const [moved] = fields.splice(from, 1)
  fields.splice(to, 0, moved)
  return { ...draft, fields }
}

export function updateField(draft: SchemaDraft, index: number, patch: Partial<FieldDef>): SchemaDraft {
  const fields = draft.fields.map((f, i) => (i === index ? { ...f, ...patch, config: { ...f.config, ...(patch.config ?? {}) } } : f))
  return { ...draft, fields }
}

export function setRule(draft: SchemaDraft, rule: DeriveRule): SchemaDraft {
  return {
    ...draft,
    rule,
    fields: draft.fields.map((f) => ((f.config.tag ?? f.name) === 'd' ? { ...f, config: { ...f.config, hint: ruleHint(rule) } } : f)),
  }
}
