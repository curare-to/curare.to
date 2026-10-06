import { expect, test } from '@playwright/test'
import { nip19 } from 'nostr-tools'
import { CURATOR, DOMAIN, DOMAIN_LIST, IDENTIFIER, RELAY, domainSchemaEvent } from './list'
import { CURATED_SCHEMA_KIND } from '../lib/protocol/curated'

const naddr = (identifier: string, relays?: string[]) =>
  nip19.naddrEncode({ kind: CURATED_SCHEMA_KIND, pubkey: CURATOR, identifier, ...(relays ? { relays } : {}) })

/**
 * The address a list is at: an naddr, which keeps naming it when the curator
 * revises the schema, and the domain once the domain has answered for it.
 */
test('a list is at its naddr, and the links it gives out carry the relay it lives on', async ({ page }) => {
  await page.goto(`/r/${naddr(IDENTIFIER)}/`)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Things worth a look')

  // The old spelled-out coordinate still opens it, and the page's own links are naddrs.
  await page.goto(`/r/${nip19.npubEncode(CURATOR)}/${IDENTIFIER}/`)
  await page.locator('article', { hasText: 'Thing number 4' }).getByRole('link', { name: 'Thing number 4' }).click()
  await expect(page).toHaveURL(new RegExp(`/r/${naddr(IDENTIFIER)}/thing-4/$`))

  // From the directory, where the schema is in hand, the naddr carries its relay.
  await page.goto('/all/')
  await expect(page.getByRole('link', { name: 'Things worth a look' })).toHaveAttribute(
    'href',
    new RegExp(`/r/${naddr(IDENTIFIER, [RELAY])}/$`),
  )
})

test('a list whose claimed domain answers for it moves to that domain, in place', async ({ page }) => {
  const schema = domainSchemaEvent()
  // The site at things.example, played here: who the curator is, and the schema it serves.
  await page.route(`https://${DOMAIN}/.well-known/nostr.json**`, (route) =>
    route.fulfill({ json: { names: { _: CURATOR } } }),
  )
  await page.route(`https://${DOMAIN}/.well-known/curare.to/nostr.json`, (route) => route.fulfill({ json: schema }))

  await page.goto(`/r/${naddr(DOMAIN_LIST)}/?tab=new`)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(DOMAIN)
  // The address bar is corrected to the domain, the tab is kept, and the list never reloads.
  await expect(page).toHaveURL(new RegExp(`/r/${DOMAIN}/\\?tab=new$`))
  await expect(page.getByTitle(/names this curator and serves this signed schema/)).toBeVisible()

  // In place: Back leaves the list, it does not step through the naddr.
  await page.goBack()
  await expect(page).not.toHaveURL(new RegExp(`/r/${naddr(DOMAIN_LIST)}/`))
})

test('a domain nobody answers for stays at the naddr', async ({ page }) => {
  await page.route(`https://${DOMAIN}/.well-known/**`, (route) => route.fulfill({ status: 404, body: '' }))
  await page.goto(`/r/${naddr(DOMAIN_LIST)}/`)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(DOMAIN)
  await expect(page.getByText('✗ unverified')).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/r/${naddr(DOMAIN_LIST)}/$`))
})
