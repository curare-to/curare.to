import { expect, test } from '@playwright/test'
import { nip19 } from 'nostr-tools'
import { installExtension } from './extension'
import { CURATOR, MOD_LIST } from './list'

const LIST = `/r/${nip19.npubEncode(CURATOR)}/${MOD_LIST}/`

test('the curator works the queue: approve, reject, edit-then-approve, re-curate, add directly', async ({ page }) => {
  await installExtension(page, 'e2e curator')
  await page.goto(LIST)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('link', { name: 'Queue ✎' }).click()
  await expect(page).toHaveURL(/\?tab=queue$/)

  await expect(page.getByRole('heading', { name: 'Pending (3)' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Updated since curated (1)' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 3, name: 'Mod thing four, corrected' })).toBeVisible()

  // Approve as-is.
  const one = page.locator('article', { hasText: 'Mod thing one' })
  await one.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Pending (2)' })).toBeVisible()

  // Reject with a reason.
  const two = page.locator('article', { hasText: 'Mod thing two' })
  await two.getByRole('button', { name: 'Reject' }).click()
  await two.getByLabel('Reason').fill('Not a thing.')
  await two.getByRole('button', { name: 'Reject' }).click()
  await expect(page.getByRole('heading', { name: 'Pending (1)' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Rejected \(1\)/ })).toBeVisible()

  // Edit, then approve: correct the title on the way through.
  const three = page.locator('article', { hasText: 'Mod thing three' })
  await three.getByRole('button', { name: 'Edit, then approve' }).click()
  await three.getByLabel(/^Title/).fill('Mod thing three, tidied')
  await three.getByRole('button', { name: 'Sign and curate' }).click()
  await expect(page.getByRole('heading', { name: 'Pending (0)' })).toBeVisible()

  // Re-curate the edited one.
  const four = page.locator('article', { hasText: 'Mod thing four' })
  await four.getByRole('button', { name: 'Approve the update' }).click()
  await expect(page.getByRole('heading', { name: /Updated since curated/ })).toHaveCount(0)

  // The front page now: four, three (tidied), one — and not two.
  await page.getByRole('link', { name: 'Front page' }).click()
  await expect(page.locator('article')).toHaveCount(3)
  await expect(page.locator('article', { hasText: 'Mod thing four, corrected' })).toBeVisible()
  await expect(page.locator('article', { hasText: 'Mod thing three, tidied' })).toBeVisible()
  await expect(page.locator('article', { hasText: 'Mod thing one' })).toBeVisible()

  // New hides the rejected one unless asked; its page says why.
  await page.getByRole('link', { name: 'New' }).click()
  await expect(page.locator('article', { hasText: 'Mod thing two' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Show 1 rejected' }).click()
  await expect(page.locator('article', { hasText: 'Mod thing two' })).toHaveCount(1)
  await page.goto(`${LIST}mod-2/`)
  await expect(page.getByText('The curator rejected this suggestion: “Not a thing.”')).toBeVisible()

  // Add an entry nobody suggested.
  await page.goto(`${LIST}?tab=queue`)
  await page.getByRole('link', { name: 'Add an entry directly' }).click()
  await expect(page.getByRole('heading', { name: /Add an entry to Moderated things/ })).toBeVisible()
  await page.getByLabel(/^Title/).fill('Straight to the front')
  await page.getByLabel(/^Link/).fill('https://example.org/direct')
  await page.getByRole('button', { name: 'Sign and curate' }).click()
  await expect(page.getByText('It is on the front page')).toBeVisible()
  await page.goto(LIST)
  await expect(page.locator('article', { hasText: 'Straight to the front' })).toBeVisible() // the front page shows curated entries only
})

test('a signed-in stranger sees the queue read-only, and is sent to the app', async ({ page }) => {
  await installExtension(page, 'e2e stranger')
  await page.goto(`${LIST}?tab=queue`)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('This list is curated by a key that is not in your extension.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'download it' })).toHaveAttribute('href', /curated-kmp/)
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0)
})
