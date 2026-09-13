import { describe, expect, it } from 'vitest'
import { nip19 } from 'nostr-tools'
import { buildPath, isShellPath, parseRoute, type Route } from '@/lib/routes'

const PK = 'f87cde3b78b9739f7d19b4dfe5f28a532f67f653bb40df147eb29066472ed72e'
const NPUB = nip19.npubEncode(PK)

describe('routes', () => {
  const cases: [string, Route][] = [
    ['/', { kind: 'home' }],
    [`/r/${NPUB}/bitcoin.mov/`, { kind: 'list', list: { by: 'coordinate', curator: { type: 'pubkey', pubkey: PK }, identifier: 'bitcoin.mov' }, tab: 'front' }],
    [`/r/${NPUB}/bitcoin.mov/?tab=new`, { kind: 'list', list: { by: 'coordinate', curator: { type: 'pubkey', pubkey: PK }, identifier: 'bitcoin.mov' }, tab: 'new' }],
    [`/r/${NPUB}/bitcoin.mov/?tab=queue`, { kind: 'list', list: { by: 'coordinate', curator: { type: 'pubkey', pubkey: PK }, identifier: 'bitcoin.mov' }, tab: 'queue' }],
    [`/r/${NPUB}/bitcoin.mov/imdb%3Att2821314/`, { kind: 'entry', list: { by: 'coordinate', curator: { type: 'pubkey', pubkey: PK }, identifier: 'bitcoin.mov' }, entry: 'imdb:tt2821314' }],
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

  it('reads a hex pubkey and an uppercased npub, and builds the npub form', () => {
    expect(parseRoute(`/r/${PK}/x/`)).toMatchObject({ kind: 'list', list: { curator: { pubkey: PK } } })
    expect(parseRoute(`/r/${NPUB.toUpperCase()}/x/`)).toMatchObject({ kind: 'list', list: { curator: { pubkey: PK } } })
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
