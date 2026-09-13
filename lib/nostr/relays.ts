import {
  CURATED_CANONICAL_KIND,
  CURATED_SCHEMA_KIND,
  CURATED_SUGGESTION_KIND,
  isRelayUrl,
} from '@/lib/protocol/curated'

export { CURATED_CANONICAL_KIND, CURATED_SCHEMA_KIND, CURATED_SUGGESTION_KIND }

/**
 * Relay set — defined in relayList.ts, which has no imports so that plain
 * Node can load it too. Publishing is best-effort, so a relay being down is
 * not fatal.
 *
 * These are the site's *directory* relays: where schemas are looked up when
 * an address names none, and the fallback for a schema with no `relay` tags.
 * A sub's own relays always come from its schema (decision 5). The built-in
 * list is a default; the viewer may replace it (directoryRelays below), and
 * relay.curare.to is a cache, not an authority.
 */
export { READ_RELAYS, WRITE_RELAYS } from './relayList'
import { READ_RELAYS } from './relayList'

const SETTING = 'curare.to:directory-relays'
const listeners = new Set<() => void>()
let override: string[] | null | undefined

function load(): string[] | null {
  if (override !== undefined) return override
  override = null
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SETTING)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) override = parsed.map(String).filter(isRelayUrl)
    }
  } catch {
    override = null
  }
  return override
}

/** The directory relays in force: the viewer's setting when they made one, else the built-in list. */
export function directoryRelays(): readonly string[] {
  const chosen = load()
  return chosen && chosen.length > 0 ? chosen : READ_RELAYS
}

/** Replace the setting; an empty list means the default. */
export function setDirectoryRelays(relays: string[] | null): void {
  const clean = relays ? relays.map((r) => r.trim()).filter(isRelayUrl) : null
  override = clean && clean.length > 0 ? clean : null
  try {
    if (override) window.localStorage.setItem(SETTING, JSON.stringify(override))
    else window.localStorage.removeItem(SETTING)
  } catch {
    // storage unavailable; the choice holds for this page
  }
  for (const listener of listeners) listener()
}

export function subscribeDirectoryRelays(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
