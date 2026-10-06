import { describe, expect, it } from 'vitest'
import { nip19 } from 'nostr-tools'
import { buildPath, isShellPath, listRefOf, naddrSegment, parseRoute, type ListRef, type Route } from '@/lib/routes'
import { CURATED_SCHEMA_KIND } from '@/lib/protocol/curated'

const PK = 'f87cde3b78b9739f7d19b4dfe5f28a532f67f653bb40df147eb29066472ed72e'
const NPUB = nip19.npubEncode(PK)
const D = 'bitcoin.mov'
const RELAY = 'wss://relay.example'
const NADDR = naddrSegment(PK, D)
const HINTED = naddrSegment(PK, D, [RELAY])
const coordinate = (relays?: string[]): ListRef => ({
  by: 'coordinate',
  curator: { type: 'pubkey', pubkey: PK },
  identifier: D,
  ...(relays ? { relays } : {}),
})

describe('routes', () => {
  const cases: [string, Route][] = [
    ['/', { kind: 'home' }],
    [`/r/${NADDR}/`, { kind: 'list', list: coordinate(), tab: 'front' }],
    [`/r/${NADDR}/?tab=new`, { kind: 'list', list: coordinate(), tab: 'new' }],
    [`/r/${NADDR}/?tab=queue`, { kind: 'list', list: coordinate(), tab: 'queue' }],
    [`/r/${NADDR}/imdb%3Att2821314/`, { kind: 'entry', list: coordinate(), entry: 'imdb:tt2821314' }],
    [`/r/${HINTED}/`, { kind: 'list', list: coordinate([RELAY]), tab: 'front' }],
    [`/r/${HINTED}/imdb%3Att2821314/`, { kind: 'entry', list: coordinate([RELAY]), entry: 'imdb:tt2821314' }],
    ['/r/_@bitcoin.mov/bitcoin.mov/', { kind: 'list', list: { by: 'coordinate', curator: { type: 'nip05', address: '_@bitcoin.mov' }, identifier: 'bitcoin.mov' }, tab: 'front' }],
    ['/r/bitcoin.mov/', { kind: 'list', list: { by: 'domain', domain: 'bitcoin.mov' }, tab: 'front' }],
    ['/r/bitcoin.mov/the-bitcoin-gospel-2015/', { kind: 'entry', list: { by: 'domain', domain: 'bitcoin.mov' }, entry: 'the-bitcoin-gospel-2015' }],
    [`/u/${NPUB}/`, { kind: 'user', pubkey: PK }],
  ]

  for (const [path, route] of cases) {
    it(`round-trips ${path}`, () => {
      const [pathname, search = ''] = path.split('?')
      expect(parseRoute(pathname, search ? `?${search}` : '')).toEqual(route)
      expect(buildPath(route)).toBe(path)
    })
  }

  it('reads a hex pubkey and an uppercased npub', () => {
    expect(parseRoute(`/r/${PK}/x/`)).toMatchObject({ kind: 'list', list: { curator: { pubkey: PK } } })
    expect(parseRoute(`/r/${NPUB.toUpperCase()}/x/`)).toMatchObject({ kind: 'list', list: { curator: { pubkey: PK } } })
  })

  it('still reads the coordinate spelled out, and builds it as an naddr', () => {
    const spelled = parseRoute(`/r/${NPUB}/${D}/`)
    expect(spelled).toEqual({ kind: 'list', list: coordinate(), tab: 'front' })
    expect(buildPath(spelled)).toBe(`/r/${NADDR}/`)
    const entry = parseRoute(`/r/${NPUB}/${D}/imdb%3Att2821314/`)
    expect(entry).toEqual({ kind: 'entry', list: coordinate(), entry: 'imdb:tt2821314' })
    expect(buildPath(entry)).toBe(`/r/${NADDR}/imdb%3Att2821314/`)
  })

  it('leaves a NIP-05 curator spelled out: there is no pubkey to encode until it resolves', () => {
    const route = parseRoute(`/r/_@${D}/${D}/`)
    expect(buildPath(route)).toBe(`/r/_@${D}/${D}/`)
  })

  it('names the same list after the schema is revised: the naddr is the coordinate, not an event', () => {
    expect(naddrSegment(PK, D)).toBe(nip19.naddrEncode({ kind: CURATED_SCHEMA_KIND, pubkey: PK, identifier: D }))
    expect(parseRoute(`/r/${NADDR}/`)).toEqual(parseRoute(`/r/${NPUB}/${D}/`))
  })

  it('carries the schema\'s own relays as hints, two at most', () => {
    const relays = ['wss://one.example', 'wss://two.example', 'wss://three.example']
    const ref = listRefOf({ namespace: PK, identifier: D, relays })
    expect(ref).toMatchObject({ relays: relays.slice(0, 2) })
    expect(parseRoute(buildPath({ kind: 'list', list: ref, tab: 'front' }))).toEqual({ kind: 'list', list: ref, tab: 'front' })
  })

  it('refuses an naddr for another kind, and drops hints that are not relay URLs', () => {
    const wrongKind = nip19.naddrEncode({ kind: 30023, pubkey: PK, identifier: D })
    expect(parseRoute(`/r/${wrongKind}/`)).toEqual({ kind: 'unknown', path: `/r/${wrongKind}/` })
    const junk = nip19.naddrEncode({ kind: CURATED_SCHEMA_KIND, pubkey: PK, identifier: D, relays: ['https://not-a-relay.example', RELAY] })
    expect(parseRoute(`/r/${junk}/`)).toEqual({ kind: 'list', list: coordinate([RELAY]), tab: 'front' })
  })

  it('normalises a domain and refuses what is not one', () => {
    expect(parseRoute('/r/Bitcoin.MOV/')).toMatchObject({ kind: 'list', list: { by: 'domain', domain: 'bitcoin.mov' } })
    expect(parseRoute('/r/localhost/')).toEqual({ kind: 'unknown', path: '/r/localhost/' })
    expect(parseRoute('/r/npub1notreal/x/')).toEqual({ kind: 'unknown', path: '/r/npub1notreal/x/' })
  })

  it('handles too few or too many segments', () => {
    expect(parseRoute('/r/')).toEqual({ kind: 'unknown', path: '/r/' })
    expect(parseRoute(`/r/${NPUB}/`)).toEqual({ kind: 'unknown', path: `/r/${NPUB}/` })
    expect(parseRoute(`/r/${NPUB}/a/b/c/`)).toEqual({ kind: 'unknown', path: `/r/${NPUB}/a/b/c/` })
    expect(parseRoute('/r/bitcoin.mov/a/b/')).toEqual({ kind: 'unknown', path: '/r/bitcoin.mov/a/b/' })
  })

  it('strips a base path', () => {
    expect(parseRoute('/curare.to/r/bitcoin.mov/', '', '/curare.to')).toMatchObject({ kind: 'list' })
    expect(isShellPath('/curare.to/r/bitcoin.mov/', '/curare.to')).toBe(true)
    expect(isShellPath('/curare.to/all/', '/curare.to')).toBe(false)
  })

  it('knows which paths the shell serves', () => {
    expect(isShellPath('/r/bitcoin.mov/')).toBe(true)
    expect(isShellPath(`/u/${NPUB}/`)).toBe(true)
    expect(isShellPath('/')).toBe(false)
    expect(isShellPath('/all/')).toBe(false)
  })
})
