import type { Page } from '@playwright/test'
import { finalizeEvent, getPublicKey, type EventTemplate } from 'nostr-tools/pure'
import * as nip44 from 'nostr-tools/nip44'
import { pubkeyOf, testKey } from '../test/keys'

/**
 * A NIP-07 extension for the run: window.nostr with getPublicKey, signEvent
 * and nip44, the key work done in Node through exposed functions so the key
 * never enters the page — the same boundary a real extension keeps.
 */
export async function installExtension(page: Page, salt: string): Promise<string> {
  const sk = testKey(salt)
  const pubkey = pubkeyOf(salt)
  await page.exposeFunction('__curareSign', (template: EventTemplate) => finalizeEvent(template, sk))
  await page.exposeFunction('__curareEncrypt', (peer: string, plaintext: string) => nip44.encrypt(plaintext, nip44.getConversationKey(sk, peer)))
  await page.exposeFunction('__curareDecrypt', (peer: string, ciphertext: string) => nip44.decrypt(ciphertext, nip44.getConversationKey(sk, peer)))
  await page.addInitScript((pk: string) => {
    const w = window as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>
    ;(window as unknown as { nostr: unknown }).nostr = {
      getPublicKey: async () => pk,
      signEvent: async (template: unknown) => w.__curareSign(template),
      nip44: {
        encrypt: async (peer: string, plaintext: string) => w.__curareEncrypt(peer, plaintext),
        decrypt: async (peer: string, ciphertext: string) => w.__curareDecrypt(peer, ciphertext),
      },
    }
  }, pubkey)
  void getPublicKey
  return pubkey
}
