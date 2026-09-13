import { slug } from './curated'

/* ------------------------------------------------------------------ *
 * How a post gets its `d`.
 *
 * The copied module derives `d` for bitcoin.mov (IMDb ids, else a title+year
 * slug) and that rule fires only through a `derived` field the site never
 * asks it to fill: every `d` curare.to publishes is passed in explicitly
 * through `BuildOptions.identifier`. The rules the templates use live here.
 * Phase 6 fills them in; until then there is the slug fallback.
 * ------------------------------------------------------------------ */

/** The fallback rule: a slug of the title, `untitled` when even that is empty. */
export function slugIdentifier(title: string): string {
  return slug(title) || 'untitled'
}
