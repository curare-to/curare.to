import { nip19 } from 'nostr-tools'
import type { CuratedSchema } from '@/lib/protocol/curated'
import { isValidDomain, normalizeDomain } from '@/lib/protocol/curated'

/* ------------------------------------------------------------------ *
 * The URL grammar (docs/decentralized-reddit.md, decision 2). The URL is the
 * commitment: it names the curator, and the schema is fetched, verified and
 * parsed before anything else is read.
 *
 *   /r/<curator>/<d>/            the coordinate, spelled out
 *   /r/<curator>/<d>/<entry>/    one post — the group under that d
 *   /r/<domain>/                 a sub whose schema carries a verified domain
 *   /r/<domain>/<entry>/         one of its posts
 *   /u/<npub>/                   a person
 *
 * <curator> is an npub1… or a NIP-05 address (name@domain, or _@domain).
 * <domain> is a bare hostname. The three are told apart by form — an npub
 * has no dot, a NIP-05 has an @, a domain has a dot and no @ — so the two
 * shapes of /r/ never collide. Identifiers are encodeURIComponent-ed: a `d`
 * may contain anything, colons included.
 *
 * Parse and build are both here so they cannot drift.
 * ------------------------------------------------------------------ */

export type CuratorRef =
  | { type: 'pubkey'; pubkey: string }
  | { type: 'nip05'; address: string }

export type ListRef =
  | { by: 'coordinate'; curator: CuratorRef; identifier: string }
  | { by: 'domain'; domain: string }
  /**
   * The single-list build: the schema this site itself serves, at a path or
   * URL — bitcoin.mov's model. `namespace` and `identifier` are filled in
   * once resolved, so entries can be linked by coordinate.
   */
  | { by: 'wellknown'; url: string; namespace?: string; identifier?: string }

export type Route =
  | { kind: 'home' }
  | { kind: 'list'; list: ListRef; tab: ListTab }
  | { kind: 'entry'; list: ListRef; entry: string }
  | { kind: 'user'; pubkey: string }
  | { kind: 'unknown'; path: string }

export type ListTab = 'front' | 'new' | 'queue'

const NIP05 = /^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$/i

/** Parse an npub or bare hex pubkey; null for anything else. */
export function parsePubkey(value: string): string | null {
  const v = value.trim()
  if (/^[0-9a-f]{64}$/i.test(v)) return v.toLowerCase()
  if (!v.toLowerCase().startsWith('npub1')) return null
  try {
    const decoded = nip19.decode(v.toLowerCase())
    return decoded.type === 'npub' ? decoded.data : null
  } catch {
    return null
  }
}

/** The curator half of an /r/ path, or null when the segment is a domain. */
export function parseCurator(segment: string): CuratorRef | null {
  const pubkey = parsePubkey(segment)
  if (pubkey) return { type: 'pubkey', pubkey }
  if (NIP05.test(segment)) return { type: 'nip05', address: segment.toLowerCase() }
  return null
}

function segments(pathname: string, basePath: string): string[] {
  let path = pathname
  if (basePath && path.startsWith(basePath)) path = path.slice(basePath.length)
  return path
    .split('/')
    .filter((s) => s.length > 0)
    .map((s) => {
      try {
        return decodeURIComponent(s)
      } catch {
        return s
      }
    })
}

/** Turn a location into a route. Never throws; unparseable paths are `unknown`. */
export function parseRoute(
  pathname: string,
  search = '',
  basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '',
): Route {
  const parts = segments(pathname, basePath)
  const params = new URLSearchParams(search)
  const tab: ListTab = params.get('tab') === 'new' ? 'new' : params.get('tab') === 'queue' ? 'queue' : 'front'

  if (parts.length === 0) return { kind: 'home' }

  if (parts[0] === 'r' && parts.length >= 2) {
    const curator = parseCurator(parts[1])
    if (curator) {
      if (parts.length === 3) {
        return { kind: 'list', list: { by: 'coordinate', curator, identifier: parts[2] }, tab }
      }
      if (parts.length === 4) {
        return {
          kind: 'entry',
          list: { by: 'coordinate', curator, identifier: parts[2] },
          entry: parts[3],
        }
      }
      return { kind: 'unknown', path: pathname }
    }
    const domain = normalizeDomain(parts[1])
    if (isValidDomain(domain)) {
      if (parts.length === 2) return { kind: 'list', list: { by: 'domain', domain }, tab }
      if (parts.length === 3) return { kind: 'entry', list: { by: 'domain', domain }, entry: parts[2] }
    }
    return { kind: 'unknown', path: pathname }
  }

  if (parts[0] === 'u' && parts.length === 2) {
    const pubkey = parsePubkey(parts[1])
    if (pubkey) return { kind: 'user', pubkey }
  }

  return { kind: 'unknown', path: pathname }
}

const enc = encodeURIComponent

export function curatorSegment(curator: CuratorRef): string {
  return curator.type === 'pubkey' ? nip19.npubEncode(curator.pubkey) : curator.address
}

function listBase(list: ListRef): string {
  if (list.by === 'domain') return `/r/${enc(list.domain)}`
  if (list.by === 'wellknown') {
    // Entries of the site's own list link by coordinate, which the shell serves.
    return list.namespace && list.identifier ? `/r/${nip19.npubEncode(list.namespace)}/${enc(list.identifier)}` : ''
  }
  return `/r/${curatorSegment(list.curator)}/${enc(list.identifier)}`
}

/** Build a path for a route. The inverse of `parseRoute`. */
export function buildPath(route: Route): string {
  switch (route.kind) {
    case 'home':
      return '/'
    case 'list':
      // The site's own list is the home page.
      if (route.list.by === 'wellknown') return route.tab === 'front' ? '/' : `/?tab=${route.tab}`
      return `${listBase(route.list)}/${route.tab === 'front' ? '' : `?tab=${route.tab}`}`
    case 'entry':
      return `${listBase(route.list)}/${enc(route.entry)}/`
    case 'user':
      return `/u/${nip19.npubEncode(route.pubkey)}/`
    case 'unknown':
      return route.path
  }
}

/** The coordinate form of a schema's address — always resolvable from a relay. */
export function listRefOf(schema: Pick<CuratedSchema, 'namespace' | 'identifier'>): ListRef {
  return {
    by: 'coordinate',
    curator: { type: 'pubkey', pubkey: schema.namespace },
    identifier: schema.identifier,
  }
}

export function listPath(schema: Pick<CuratedSchema, 'namespace' | 'identifier'>, tab: ListTab = 'front'): string {
  return buildPath({ kind: 'list', list: listRefOf(schema), tab })
}

export function entryPath(schema: Pick<CuratedSchema, 'namespace' | 'identifier'>, entry: string): string {
  return buildPath({ kind: 'entry', list: listRefOf(schema), entry })
}

export function userPath(pubkey: string): string {
  return buildPath({ kind: 'user', pubkey })
}

/** Is this a path the client-side shell serves, rather than a static page? */
export function isShellPath(pathname: string, basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''): boolean {
  const parts = segments(pathname, basePath)
  return parts.length > 0 && (parts[0] === 'r' || parts[0] === 'u')
}
