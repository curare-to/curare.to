import type { Page } from '@playwright/test'
import { finalizeEvent, type EventTemplate } from 'nostr-tools/pure'
import { pubkeyOf, testKey } from '../test/keys'

/**
 * A NIP-07 extension for the run: window.nostr with getPublicKey and
 * signEvent, the signing done in Node through an exposed function so the
 * key never enters the page — the same boundary a real extension keeps.
 */
export async function installExtension(page: Page, salt: string): Promise<string> {
  const pubkey = pubkeyOf(salt)
  await page.exposeFunction('__curareSign', (template: EventTemplate) => finalizeEvent(template, testKey(salt)))
  await page.addInitScript((pk: string) => {
    ;(window as unknown as { nostr: unknown }).nostr = {
      getPublicKey: async () => pk,
      signEvent: async (template: unknown) =>
        (window as unknown as { __curareSign: (t: unknown) => Promise<unknown> }).__curareSign(template),
    }
  }, pubkey)
  return pubkey
}
