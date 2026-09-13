import type { SimplePool } from 'nostr-tools/pool'
import { verifyEvent, type Event } from 'nostr-tools/pure'
import {
  CURATED_SCHEMA_KIND,
  normalizeDomain,
  parseCuratedSchemaEvent,
  verifyCuratedSchemaEvent,
  type CuratedSchema,
} from '@/lib/protocol/curated'
import { pool as defaultPool } from '@/lib/nostr/pool'
import { READ_RELAYS } from '@/lib/nostr/relays'
import type { CuratorRef, ListRef } from '@/lib/routes'

/* ------------------------------------------------------------------ *
 * An address becomes a verified schema, or a reason it did not.
 *
 * The NIP is strict that a client must establish the curator's pubkey before
 * it reads a list, and must not take it from an unsigned source. bitcoin.mov
 * takes it from the signed event at its own well-known path; curare.to reads
 * many lists, so the commitment is in the address (decision 2):
 *
 *   npub + d     the relay lookup, on the directory relays and then on any
 *                relay the result names; newest created_at wins, ties on id
 *   nip05 + d    NIP-05 to a pubkey, then as above
 *   domain       GET https://<domain>/.well-known/curare.to/nostr.json — the
 *                body must be a signed kind 31889 whose `domain` tag is that
 *                host — then the relay lookup, to catch a newer revision
 *
 * Every path ends in verifyEvent and parseCuratedSchemaEvent. The site
 * serving a file proves nothing about who wrote it; the signature does.
 * ------------------------------------------------------------------ */

export type Resolution =
  | { status: 'ready'; schema: CuratedSchema; event: Event }
  | { status: 'unavailable'; reason: string }

export interface ResolveDeps {
  pool: Pick<SimplePool, 'querySync'>
  relays: readonly string[]
  fetch: typeof fetch
  timeoutMs: number
}

const defaultDeps = (): ResolveDeps => ({
  pool: defaultPool,
  relays: READ_RELAYS,
  fetch: (...args) => fetch(...args),
  timeoutMs: 8000,
})

const unavailable = (reason: string): Resolution => ({ status: 'unavailable', reason })

/** Newest `created_at` wins; a tie breaks on `id`, the one thing every device shares. */
export function newest<T extends { created_at: number; id: string }>(events: T[]): T | null {
  let best: T | null = null
  for (const event of events) {
    if (!best || event.created_at > best.created_at || (event.created_at === best.created_at && event.id > best.id)) {
      best = event
    }
  }
  return best
}

/** A signed event becomes a schema, or a reason. The one gate every path ends in. */
export function schemaFromEvent(event: unknown): Resolution {
  if (!event || typeof event !== 'object' || !('sig' in event)) {
    return unavailable('is not a signed Nostr event')
  }
  const signed = event as Event
  if (!verifyEvent(signed)) return unavailable('carries a signature that does not verify')
  const verdict = verifyCuratedSchemaEvent(signed)
  if (!verdict.ok) {
    return unavailable(`is not a usable schema: ${verdict.violations.map((v) => v.message).join(' ')}`)
  }
  const schema = parseCuratedSchemaEvent(signed)
  if (!schema) return unavailable('is not a usable schema')
  return { status: 'ready', schema, event: signed }
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/**
 * The relay lookup: the newest kind 31889 by this pubkey with this `d`, from
 * the given relays and then from any relay the result itself names. Only a
 * usable, signature-verified schema counts; a newer revision that fails is
 * ignored in favour of an older one that passes.
 */
export type Ready = Extract<Resolution, { status: 'ready' }>

async function lookupOnRelays(
  pubkey: string,
  identifier: string,
  relays: readonly string[],
  deps: ResolveDeps,
): Promise<Ready | null> {
  const filter = { kinds: [CURATED_SCHEMA_KIND], authors: [pubkey], '#d': [identifier] }
  const seen = new Set<string>()
  let queue = [...new Set(relays)]
  let best: Ready | null = null

  // Two hops at most: the directory relays, then the relays the schema names.
  for (let hop = 0; hop < 2 && queue.length > 0; hop++) {
    const targets = queue.filter((r) => !seen.has(r))
    for (const r of targets) seen.add(r)
    if (targets.length === 0) break

    let events: Event[] = []
    try {
      events = await withTimeout(deps.pool.querySync(targets, filter), deps.timeoutMs, 'relay lookup')
    } catch {
      events = []
    }
    for (const event of events) {
      if (event.pubkey !== pubkey) continue
      const resolved = schemaFromEvent(event)
      if (resolved.status !== 'ready') continue
      if (resolved.schema.identifier !== identifier) continue
      if (!best || newest([best.event, resolved.event]) === resolved.event) best = resolved
    }
    queue = best ? best.schema.relays : []
  }
  return best
}

async function resolveCurator(curator: CuratorRef, deps: ResolveDeps): Promise<string | Resolution> {
  if (curator.type === 'pubkey') return curator.pubkey
  const [name, domain] = curator.address.split('@')
  const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`
  let body: { names?: Record<string, string> }
  try {
    const response = await withTimeout(deps.fetch(url), deps.timeoutMs, 'NIP-05 lookup')
    if (!response.ok) return unavailable(`${curator.address} did not resolve (${response.status})`)
    body = await response.json()
  } catch (error) {
    return unavailable(`${curator.address} did not resolve (${error instanceof Error ? error.message : 'network error'})`)
  }
  const pubkey = body?.names?.[name]
  if (typeof pubkey !== 'string' || !/^[0-9a-f]{64}$/i.test(pubkey)) {
    return unavailable(`${curator.address} names no pubkey`)
  }
  return pubkey.toLowerCase()
}

/** The domain form: the site's own well-known document, then the relays for a newer revision. */
async function resolveDomain(domain: string, deps: ResolveDeps): Promise<Resolution> {
  const host = normalizeDomain(domain)
  const url = `https://${host}/.well-known/curare.to/nostr.json`
  let body: unknown
  try {
    const response = await withTimeout(deps.fetch(url, { cache: 'no-cache' }), deps.timeoutMs, 'well-known fetch')
    if (!response.ok) return unavailable(`${host} serves no list (${response.status} at /.well-known/curare.to/nostr.json)`)
    body = await response.json()
  } catch (error) {
    return unavailable(`${host} could not be reached (${error instanceof Error ? error.message : 'network error'})`)
  }
  const fromSite = schemaFromEvent(body)
  if (fromSite.status !== 'ready') return unavailable(`${host}'s well-known document ${fromSite.reason}`)
  // A schema that claims a domain must claim this one. One that claims none is
  // fine: the site serving the signed file is what ties the two together, and
  // bitcoin.mov's own published schema carries no domain tag.
  if (fromSite.schema.domain && normalizeDomain(fromSite.schema.domain) !== host) {
    return unavailable(`${host} serves a schema whose domain tag is "${fromSite.schema.domain}", not ${host}`)
  }

  // The site's copy fixes the curator; a relay may hold a newer revision by
  // the same key, and only a newer one by the same key is taken.
  const fromRelays = await lookupOnRelays(
    fromSite.event.pubkey,
    fromSite.schema.identifier,
    [...fromSite.schema.relays, ...deps.relays],
    deps,
  )
  if (fromRelays && newest([fromSite.event, fromRelays.event]) === fromRelays.event) {
    if (!fromRelays.schema.domain || normalizeDomain(fromRelays.schema.domain) === host) return fromRelays
  }
  return fromSite
}

/** Resolve a list address. Never throws. */
export async function resolveSchema(ref: ListRef, overrides: Partial<ResolveDeps> = {}): Promise<Resolution> {
  const deps = { ...defaultDeps(), ...overrides }
  if (ref.by === 'domain') return resolveDomain(ref.domain, deps)

  const curator = await resolveCurator(ref.curator, deps)
  if (typeof curator !== 'string') return curator

  const found = await lookupOnRelays(curator, ref.identifier, deps.relays, deps)
  if (found) return found
  return unavailable(
    `no usable schema "${ref.identifier}" by that curator was found on ${deps.relays.length === 1 ? deps.relays[0] : `${deps.relays.length} relays`}`,
  )
}

/* -------------------------- session cache --------------------------- */

const cache = new Map<string, Promise<Resolution>>()

export function cacheKey(ref: ListRef): string {
  return ref.by === 'domain'
    ? `domain:${normalizeDomain(ref.domain)}`
    : `${ref.curator.type}:${ref.curator.type === 'pubkey' ? ref.curator.pubkey : ref.curator.address}:${ref.identifier}`
}

/**
 * Resolve once per address per page load and share the answer — a failure is
 * not cached, so a relay that was down gets asked again next time.
 */
export function resolveSchemaCached(ref: ListRef): Promise<Resolution> {
  const key = cacheKey(ref)
  const cached = cache.get(key)
  if (cached) return cached
  const promise = resolveSchema(ref).then((result) => {
    if (result.status !== 'ready') cache.delete(key)
    // A schema found by address is also known by its coordinate now.
    else cache.set(cacheKey({ by: 'coordinate', curator: { type: 'pubkey', pubkey: result.schema.namespace }, identifier: result.schema.identifier }), Promise.resolve(result))
    return result
  })
  cache.set(key, promise)
  return promise
}

/** For tests and for a "refresh" action. */
export function clearResolveCache(): void {
  cache.clear()
}
