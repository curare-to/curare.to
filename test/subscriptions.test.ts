import { describe, expect, it } from 'vitest'
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure'
import * as nip44 from 'nostr-tools/nip44'
import { buildSubscriptionsTemplate, parseSubscriptions } from '@/lib/protocol/subscriptions'
import { pubkeyOf, testKey } from './keys'

describe('subscriptions', () => {
  const sk = testKey('viewer')
  const me = getPublicKey(sk)
  // What the extension does for us: NIP-44 to oneself.
  const key = nip44.getConversationKey(sk, me)
  const encrypt = async (plaintext: string) => nip44.encrypt(plaintext, key)
  const decrypt = async (ciphertext: string) => nip44.decrypt(ciphertext, key)

  const a = `31889:${pubkeyOf('curator')}:things`
  const b = `31889:${pubkeyOf('other curator')}:films`

  it('round-trips public and private items, dedupes, and ignores what is not a schema', async () => {
    const template = await buildSubscriptionsTemplate(
      [
        { coordinate: a, relay: 'wss://r', private: false },
        { coordinate: b, relay: '', private: true },
        { coordinate: a, relay: 'wss://again', private: true }, // duplicate, dropped
        { coordinate: `31888:${pubkeyOf('bob')}:x`, relay: '', private: false }, // not a schema
      ],
      encrypt,
      1,
    )
    expect(template.kind).toBe(10889)
    expect(template.tags).toEqual([['a', a, 'wss://r']])
    expect(template.content).not.toContain(b)

    const event = finalizeEvent(template, sk)
    const readable = await parseSubscriptions(event, decrypt)
    expect(readable).toEqual({
      subscriptions: [
        { coordinate: a, relay: 'wss://r', private: false },
        { coordinate: b, relay: '', private: true },
      ],
      privateUnreadable: false,
    })

    const withoutKey = await parseSubscriptions(event, null)
    expect(withoutKey.subscriptions).toEqual([{ coordinate: a, relay: 'wss://r', private: false }])
    expect(withoutKey.privateUnreadable).toBe(true)
  })

  it('refuses a private item without a way to encrypt, and needs nothing for public ones', async () => {
    await expect(buildSubscriptionsTemplate([{ coordinate: a, relay: '', private: true }], null)).rejects.toThrow(/NIP-44/)
    const template = await buildSubscriptionsTemplate([{ coordinate: a, relay: '', private: false }], null, 1)
    expect(template.content).toBe('')
  })
})
