import {
  CURATED_CANONICAL_KIND,
  CURATED_SCHEMA_KIND,
  CURATED_SUGGESTION_KIND,
} from '@/lib/protocol/curated'

export { CURATED_CANONICAL_KIND, CURATED_SCHEMA_KIND, CURATED_SUGGESTION_KIND }

/**
 * Relay set — defined in relayList.ts, which has no imports so that plain
 * Node can load it too. Publishing is best-effort, so a relay being down is
 * not fatal.
 *
 * These are the site's *directory* relays: where schemas are looked up when
 * an address names none, and the fallback for a schema with no `relay` tags.
 * A sub's own relays always come from its schema (decision 5).
 */
export { READ_RELAYS, WRITE_RELAYS } from './relayList'
