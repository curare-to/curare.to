import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { finalizeEvent } from 'nostr-tools/pure'
import { SimplePool } from 'nostr-tools/pool'
import { nip19 } from 'nostr-tools'
import { parseCuratedSchemaEvent, verifyCuratedCanonical } from '@/lib/protocol/curated'
import { emptyValues, prepareSuggestion } from '@/lib/entry/form'
import { FakeRelay } from './fakeRelay'
import { testKey } from './keys'

/* ------------------------------------------------------------------ *
 * Phase 2's "done when", offline: a suggestion this site would publish to
 * bitcoin.mov's list is one bitcoin.mov's own `npm run curate` — in its own
 * checkout, unchanged — accepts and turns into a canonical entry. Opt-in
 * with INTEROP=1 because it needs ../bitcoin.mov beside this repository;
 * the script runs in unsigned mode (NOSTR_NPUB) against the fake relay, so
 * nothing is signed with any real key and nothing leaves this machine.
 * ------------------------------------------------------------------ */

const run = promisify(execFile)
const BITCOIN_MOV = path.resolve(__dirname, '..', '..', 'bitcoin.mov')
const available = process.env.INTEROP && fs.existsSync(path.join(BITCOIN_MOV, 'scripts', 'curate.mjs'))

describe.skipIf(!available)('bitcoin.mov interop', () => {
  let relay: FakeRelay
  const pool = new SimplePool()
  beforeAll(async () => {
    relay = await FakeRelay.start()
  })
  afterAll(async () => {
    pool.close([relay.url])
    await relay.close()
  })

  it("a suggestion made here is one bitcoin.mov's curate script can curate", async () => {
    const published = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'vectors', 'bitcoin-mov-published.json'), 'utf8'))
    const schema = parseCuratedSchemaEvent(published)!
    // Their script reads the schema off the relay it is pointed at: give it the real one.
    relay.seed(published)

    const values = {
      ...emptyValues(schema),
      title: 'Banking on Bitcoin',
      year: '2016',
      type: 'documentary',
      director: 'Christopher Cannucciari',
      watchUrl: 'https://www.youtube.com/watch?v=tmxqlSevtkQ',
      externalId: 'imdb:tt5033790',
      lang: 'en',
      description: 'Early adopters and the first regulators.',
    }
    const pubkey = finalizeEvent({ kind: 1, tags: [], content: '', created_at: 1 }, testKey('interop')).pubkey
    const prepared = prepareSuggestion(schema, values, { pubkey, identifier: 'imdb:tt5033790', now: 1_760_000_000 })
    expect(prepared.errors).toEqual({})
    const signed = finalizeEvent(prepared.template!, testKey('interop'))
    await Promise.all(pool.publish([relay.url], signed))

    const { stdout, stderr } = await run(
      'node',
      ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', 'scripts/curate.mjs', `--relay=${relay.url}`, `--id=${signed.id}`],
      { cwd: BITCOIN_MOV, env: { ...process.env, NOSTR_NPUB: nip19.npubEncode(schema.namespace), NODE_ENV: 'development' }, timeout: 30_000 },
    )
    const lines = stdout.split('\n').filter((l) => l.trim().startsWith('{'))
    expect(lines, `curate printed nothing to sign:\n${stderr}`).toHaveLength(1)

    const template = JSON.parse(lines[0])
    expect(template.kind).toBe(31890)
    expect(template.tags).toContainEqual(['d', 'imdb:tt5033790'])
    expect(template.tags).toContainEqual(['title', 'Banking on Bitcoin'])
    expect(template.tags).toContainEqual(['a', `31888:${pubkey}:imdb:tt5033790`, '', 'mention'])
    expect(template.tags).toContainEqual(['e', signed.id, '', 'mention'])
    // What their script built verifies here as a canonical entry by their curator.
    expect(verifyCuratedCanonical(template, schema, { pubkey: schema.namespace }).ok).toBe(true)
  })
})
