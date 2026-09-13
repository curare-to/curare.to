import { expect, test } from '@playwright/test'
import { nip19 } from 'nostr-tools'
import { installExtension } from './extension'
import { CURATOR, IDENTIFIER } from './list'

const LIST = `/r/${nip19.npubEncode(CURATOR)}/${IDENTIFIER}/`

test('sign in, suggest, see it in the queue, edit it, and be warned about a duplicate', async ({ page }) => {
  await installExtension(page, 'e2e poster')

  await page.goto(LIST)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()

  // Suggest: a full navigation to the static form page, addressed to this list.
  await page.getByRole('link', { name: 'Suggest' }).click()
  await expect(page).toHaveURL(/\/submit\/\?to=31889%3A/)
  await expect(page.getByRole('heading', { name: /Suggest to Things worth a look/ })).toBeVisible()

  // The form is the schema: title, link, text, flair — and a derived identifier.
  await page.getByLabel(/^Title/).fill('A thirteenth thing')
  await page.getByLabel(/^Link/).fill('https://example.org/things/13')
  await page.getByLabel(/^Text/).fill('Notes on the thirteenth, see https://example.org/notes/13')
  await page.getByLabel(/^Flair/).selectOption('tool')
  await expect(page.getByText('Identifier:')).toContainText('a-thirteenth-thing')
  await page.getByRole('button', { name: 'Sign and publish' }).click()

  await expect(page.getByRole('heading', { name: 'Published' })).toBeVisible()
  await page.getByRole('link', { name: 'See it' }).click()
  await expect(page).toHaveURL(/a-thirteenth-thing\/$/)
  await expect(page.getByRole('heading', { level: 1, name: 'A thirteenth thing' })).toBeVisible()
  await expect(page.locator('article header')).toContainText('pending')
  await expect(page.locator('article header')).toContainText('suggested by')

  // Edit: reopens the form with the entry's values, and replaces it under the same d.
  await page.getByRole('link', { name: 'Edit your entry' }).click()
  await expect(page.getByRole('heading', { name: 'Edit your suggestion' })).toBeVisible()
  await expect(page.getByLabel(/^Title/)).toHaveValue('A thirteenth thing')
  await page.getByLabel(/^Title/).fill('A thirteenth thing, revised')
  await page.getByRole('button', { name: 'Publish the edit' }).click()
  await expect(page.getByRole('heading', { name: 'Published' })).toBeVisible()
  await page.getByRole('link', { name: 'See it' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'A thirteenth thing, revised' })).toBeVisible()

  // The queue has it, once, under the revised title.
  await page.goto(`${LIST}?tab=new`)
  await expect(page.locator('article', { hasText: 'A thirteenth thing' })).toHaveCount(1)
  await expect(page.locator('article', { hasText: 'thirteenth' })).toContainText('revised')

  // A second suggestion with the same title is the same post: warned, then allowed.
  await page.getByRole('link', { name: 'Suggest' }).click()
  await page.getByLabel(/^Title/).fill('Thing 5') // slugs to thing-5, the fifth post's identifier
  await page.getByLabel(/^Link/).fill('https://example.org/elsewhere/5')
  await page.getByRole('button', { name: 'Sign and publish' }).click()
  await expect(page.getByText('Already suggested by')).toBeVisible()
  await expect(page.getByText('on the front page')).toBeVisible()
  await page.getByRole('button', { name: 'Sign and publish' }).click()
  await expect(page.getByRole('heading', { name: 'Published' })).toBeVisible()
})

test('a closed list refuses a stranger before the extension is asked', async ({ page }) => {
  await installExtension(page, 'e2e stranger')
  await page.goto(`/submit/?to=31889%3A${CURATOR}%3Aclosed-things`)
  await expect(page.getByRole('heading', { name: /Suggest to Closed things/ })).toBeVisible()
  await page.getByRole('button', { name: 'Sign in and publish' }).click()
  await expect(page.getByText(/your key may not submit to it/)).toBeVisible()
  await expect(page.getByRole('button', { name: /publish/ })).toBeDisabled()
})
