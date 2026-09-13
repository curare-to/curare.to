import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { finalizeEvent, type Event, type EventTemplate } from 'nostr-tools/pure'
import { Nip07Error, signAndPublish } from '@/lib/nostr/nip07'
import { FakeRelay } from './fakeRelay'
import { pubkeyOf, testKey } from './keys'

/* A NIP-07 provider that signs with a test key — what an extension does,
 * minus the prompt. Installed on a global `window` for the duration. */
function installProvider(salt: string | null) {
  const w = globalThis as unknown as { window?: unknown }
  if (salt === null) {
    w.window = {}
    return
  }
  w.window = {
    nostr: {
      getPublicKey: async () => pubkeyOf(salt),
      signEvent: async (template: EventTemplate): Promise<Event> => finalizeEvent(template, testKey(salt)),
    },
  }
}

describe('signAndPublish', () => {
  let relay: FakeRelay
  beforeAll(async () => {
    relay = await FakeRelay.start()
  })
  afterAll(async () => {
    await relay.close()
  })
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window
  })

  const template: EventTemplate = { kind: 1, tags: [], content: 'hello', created_at: 1 }

  it('signs in the extension and counts the relays that accepted', async () => {
    installProvider('bob')
    const result = await signAndPublish(template, [relay.url])
    expect(result.signed.pubkey).toBe(pubkeyOf('bob'))
    expect(result.accepted).toBe(1)
    expect(result.total).toBe(1)
    expect(relay.events.has(result.signed.id)).toBe(true)
  })

  it('explains a missing extension', async () => {
    installProvider(null)
    await expect(signAndPublish(template, [relay.url])).rejects.toThrow(Nip07Error)
    await expect(signAndPublish(template, [relay.url])).rejects.toThrow(/No Nostr signer found/)
  })

  it('fails when no relay accepts — a relay with a write policy says no', async () => {
    installProvider('bob')
    relay.refuse = 'not this kind here'
    try {
      await expect(signAndPublish(template, [relay.url])).rejects.toThrow(/no relay accepted/)
    } finally {
      relay.refuse = null
    }
  })

  it('refuses a signer that returns an invalid event', async () => {
    const w = globalThis as unknown as { window?: unknown }
    w.window = {
      nostr: {
        getPublicKey: async () => pubkeyOf('bob'),
        // A JSON round-trip, as a real extension's answer would be: nostr-tools
        // marks an event it finalized as verified, and a spread would keep the mark.
        signEvent: async (t: EventTemplate) => ({ ...JSON.parse(JSON.stringify(finalizeEvent(t, testKey('bob')))), sig: '0'.repeat(128) }),
      },
    }
    await expect(signAndPublish(template, [relay.url])).rejects.toThrow(/invalid event/)
  })
})
