import type { CuratedSchema } from './curated'

/* ------------------------------------------------------------------ *
 * The reddit-shaped default schemas a sub can start from. Phase 6 fills
 * these in; Phase 0 only reserves the shape so the module layout is settled.
 * ------------------------------------------------------------------ */

export interface SchemaTemplate {
  /** Stable key, used in the URL of the sub editor. */
  key: string
  name: string
  description: string
  /** Everything but identity and relays, which the creator supplies. */
  schema: Pick<CuratedSchema, 'fields' | 'requireAny'>
}

export const TEMPLATES: SchemaTemplate[] = []
