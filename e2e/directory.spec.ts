import { expect, test } from '@playwright/test'
import { nip19 } from 'nostr-tools'
import { installExtension } from './extension'
import { CURATOR, IDENTIFIER } from './list'

test('the directory lists every schema on the relay, hides on request, and subscribing makes the home page yours', async ({ page }) => {
  await installExtension(page, 'e2e subscriber')

  await page.goto('/all/')
  await expect(page.getByRole('heading', { name: 'All lists' })).toBeVisible()
  // The run's lists, whoever published them, verified and unjudged.
  await expect(page.getByRole('link', { name: 'Things worth a look' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Moderated things' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Closed things' })).toBeVisible()
  await expect(page.getByText('closed', { exact: true })).toBeVisible()

  // Filter, then hide one — and the hide survives a reload.
  await page.getByLabel('Filter').fill('closed')
  await expect(page.getByRole('link', { name: 'Things worth a look' })).toHaveCount(0)
  await page.getByLabel('Filter').fill('')
  await page.locator('li', { hasText: 'Closed things' }).getByRole('button', { name: 'hide' }).click()
  await expect(page.getByRole('link', { name: 'Closed things' })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('link', { name: 'Things worth a look' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Closed things' })).toHaveCount(0)

  // Signed out, the home page is the directory's: the newest lists and the hottest posts across them.
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Across the newest lists' })).toBeVisible()
  await expect(page.locator('article').first()).toBeVisible()

  // Subscribe — privately, through the extension's NIP-44 — and the home page becomes yours.
  await page.goto(`/r/${nip19.npubEncode(CURATOR)}/${IDENTIFIER}/`)
  await page.getByRole('button', { name: 'privately' }).click()
  await expect(page.getByRole('button', { name: /Subscribed \(private\)/ })).toBeVisible()
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your front page' })).toBeVisible()
  await expect(page.getByText('1 of 1 subscribed lists')).toBeVisible()
  await expect(page.locator('article', { hasText: 'Thing number 5' })).toBeVisible()
  await expect(page.getByText('in Things worth a look')).toHaveCount(5)

  // Unsubscribe from the list's page, and the home page is the directory's again.
  await page.goto(`/r/${nip19.npubEncode(CURATOR)}/${IDENTIFIER}/`)
  await page.getByRole('button', { name: /Subscribed/ }).click()
  await expect(page.getByRole('button', { name: 'Subscribe', exact: true })).toBeVisible()
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Across the newest lists' })).toBeVisible()
})
