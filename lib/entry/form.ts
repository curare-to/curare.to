import type { EventTemplate } from 'nostr-tools/pure'
import {
  buildCuratedSuggestionTemplate,
  eventToValues,
  formFields,
  validateValues,
  type CuratedSchema,
  type CuratedSuggestionLike,
  type CuratedSuggestionValues,
  type FieldDef,
} from '@/lib/protocol/curated'
import { deriveIdentifier, deriveInputOf, ruleOf, slugIdentifier } from '@/lib/protocol/derive'

/* ------------------------------------------------------------------ *
 * The form's logic, without the form: what to ask for, what is wrong,
 * and the unsigned event to hand the extension. Every `d` this site
 * publishes is passed through BuildOptions.identifier, so the copied
 * module's own derivation — bitcoin.mov's IMDb rule — never runs here.
 * ------------------------------------------------------------------ */

/** One empty value per field the form prompts for. */
export function emptyValues(schema: CuratedSchema): CuratedSuggestionValues {
  const values: CuratedSuggestionValues = {}
  for (const field of formFields(schema)) {
    values[field.name] = field.type === 'enum' ? (field.config.options?.[0] ?? '') : ''
  }
  return values
}

/** The values an existing entry carries, for editing it. */
export function valuesOfEntry(event: CuratedSuggestionLike, schema: CuratedSchema): CuratedSuggestionValues {
  return { ...emptyValues(schema), ...eventToValues(event, schema) }
}

/** The title field's value, for deriving a `d`. */
export function titleOf(values: CuratedSuggestionValues, schema: CuratedSchema): string {
  const field = schema.fields.find((f) => (f.config.tag ?? f.name) === 'title')
  return (field ? values[field.name] : values.title) ?? ''
}

/** The field that writes `d`. The normaliser guarantees there is one. */
export function identifierField(schema: CuratedSchema) {
  return schema.fields.find((f) => (f.config.tag ?? f.name) === 'd') ?? null
}

/**
 * What the entry's `d` will be. A schema whose d field is `derived` leaves it
 * to the site, which applies the rule the schema records in that field's
 * hint (`[rule:…]`, lib/protocol/derive.ts) — the title's slug when it
 * records none — and the form never prompts for it. A schema that does not
 * mark it derived wants the person to supply it (the directory's "list
 * coordinate" is that shape), so it is an input like any other and its value
 * is the identifier. `pubkey` feeds the rules that key on the author.
 */
export function identifierFor(schema: CuratedSchema, values: CuratedSuggestionValues, pubkey: string | null = null): string {
  const field = identifierField(schema)
  if (field && !field.config.derived) return (values[field.name] ?? '').trim()
  const rule = ruleOf(schema)
  if (rule === 'title' || !pubkey) return rule === 'title' ? slugIdentifier(titleOf(values, schema)) : slugIdentifier(titleOf(values, schema))
  return deriveIdentifier(rule, deriveInputOf(schema, values, pubkey))
}

/** The fields a form prompts for, and which of them are required — a require-any group is not. */
export function promptedFields(schema: CuratedSchema): { field: FieldDef; required: boolean; anyOf: string[] | null }[] {
  return formFields(schema).map((field) => ({
    field,
    required: field.required,
    anyOf: schema.requireAny.find((g) => g.includes(field.name))?.map((n) => schema.fields.find((f) => f.name === n)?.label ?? n) ?? null,
  }))
}

export interface Prepared {
  errors: Record<string, string>
  /** Present only when there are no errors. */
  template: EventTemplate | null
  identifier: string
}

/**
 * Validate and build. `identifier` is reused when editing; otherwise it is
 * derived from the title (Phase 6 replaces this with the sub's template rule).
 */
export function prepareSuggestion(
  schema: CuratedSchema,
  values: CuratedSuggestionValues,
  options: { pubkey: string | null; identifier?: string; now?: number },
): Prepared {
  const errors = validateValues(values, schema, { pubkey: options.pubkey ?? undefined })
  const identifier = options.identifier ?? identifierFor(schema, values, options.pubkey)
  if (Object.keys(errors).length > 0 || !options.pubkey) {
    // Nothing can be signed without a key, whatever the list's visibility.
    if (!options.pubkey && !errors.visibility) errors.visibility = 'Sign in to suggest to this list.'
    return { errors, template: null, identifier }
  }
  const template = buildCuratedSuggestionTemplate(values, schema, {
    identifier,
    createdAt: options.now,
  })
  return { errors, template, identifier }
}
