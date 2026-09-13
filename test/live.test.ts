import { describe, expect, it } from 'vitest'
import { verifyEvent, type Event } from 'nostr-tools/pure'
import { parseCuratedSchemaEvent, verifyCuratedSchemaEvent } from '@/lib/protocol/curated'

/* ------------------------------------------------------------------ *
 * Opt-in, network-bound: LIVE=1 npm test. Fetches the schema bitcoin.mov
 * serves today and runs it through the copied module — the Phase 0 "done
 * when". CI does not set LIVE; the same event as of 2026-09-13 is under
 * vectors/schema/bitcoin-mov-published.json and is checked every run.
 * ------------------------------------------------------------------ */

const WELL_KNOWN = 'https://bitcoin.mov/.well-known/curare.to/nostr.json'

describe.skipIf(!process.env.LIVE)('bitcoin.mov, live', () => {
  it('serves a signed, usable schema with permissive CORS', async () => {
    const response = await fetch(WELL_KNOWN, { headers: { Origin: 'https://curare.to' } })
    expect(response.ok).toBe(true)
    // Another origin's client must be able to read the file (docs/conventions.md).
    expect(response.headers.get('access-control-allow-origin')).toBe('*')

    const event = (await response.json()) as Event
    expect(verifyEvent(event)).toBe(true)
    expect(verifyCuratedSchemaEvent(event).ok).toBe(true)

    const schema = parseCuratedSchemaEvent(event)!
    expect(schema.identifier).toBe('bitcoin.mov')
    expect(schema.namespace).toBe(event.pubkey)
    expect(schema.relays.length).toBeGreaterThan(0)
  })
})
