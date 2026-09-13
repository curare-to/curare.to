import type { Event, EventTemplate } from 'nostr-tools/pure'
import {
  buildCuratedCanonicalTemplate,
  canCurate,
  curatedSuggestionRef,
  fieldTag,
  formFields,
  validateValues,
  type CuratedSchema,
  type CuratedSuggestionValues,
} from '@/lib/protocol/curated'
import { valuesOfEntry } from './form'

/* ------------------------------------------------------------------ *
 * What `npm run curate` does, for the page: a canonical entry from a
 * suggestion's values — the same d, the source named — or from nothing,
 * when the curator adds an entry nobody suggested. Curation is editorial:
 * the values may have been corrected on the way through.
 * ------------------------------------------------------------------ */

export interface PreparedCanonical {
  errors: Record<string, string>
  template: EventTemplate | null
}

export function prepareCanonical(
  schema: CuratedSchema,
  values: CuratedSuggestionValues,
  options: { curator: string | null; identifier: string; source: Event | null; now?: number },
): PreparedCanonical {
  const errors = validateValues(values, schema, { pubkey: options.curator ?? undefined })
  // validateValues judges suggesting; curating is the schema author's alone.
  delete errors.visibility
  if (!options.curator) errors.curator = 'Sign in with the curator’s key.'
  else if (!canCurate(schema, options.curator)) errors.curator = 'Only the key that published the schema may curate.'
  if (Object.keys(errors).length > 0) return { errors, template: null }

  const source = options.source ? curatedSuggestionRef(options.source, schema) : null
  const template = buildCuratedCanonicalTemplate(values, schema, source, {
    identifier: options.identifier,
    createdAt: options.now,
  })
  return { errors, template }
}

/** Approve as-is: the head suggestion's values, its d, itself as the source. */
export function approveTemplate(
  schema: CuratedSchema,
  suggestion: Event,
  curator: string | null,
  now?: number,
): PreparedCanonical {
  const d = suggestion.tags.find((t) => t[0] === 'd')?.[1] ?? ''
  return prepareCanonical(schema, valuesOfEntry(suggestion, schema), { curator, identifier: d, source: suggestion, now })
}

export interface FieldChange {
  field: string
  label: string
  before: string
  after: string
}

/** Field-by-field differences between two entries, for the re-curation view. */
export function diffEntries(schema: CuratedSchema, before: Event, after: Event): FieldChange[] {
  const a = valuesOfEntry(before, schema)
  const b = valuesOfEntry(after, schema)
  const changes: FieldChange[] = []
  for (const field of formFields(schema)) {
    if (fieldTag(field) === 'd') continue
    const x = (a[field.name] ?? '').trim()
    const y = (b[field.name] ?? '').trim()
    if (x !== y) changes.push({ field: field.name, label: field.label, before: x, after: y })
  }
  return changes
}
