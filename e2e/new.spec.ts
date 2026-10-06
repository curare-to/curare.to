import { expect, test } from '@playwright/test'
import { installExtension } from './extension'
import { CURARE_TESTFLIGHT_URL } from '../components/mod/ModQueue'

/**
 * /new/ shows what a list is made of and hands the signing to the app: the
 * editor still verifies the draft and edits its fields, and the way on is the
 * TestFlight join, not a publish. What a published list then does — suggest,
 * queue, front page, directory — is post.spec.ts, curate.spec.ts and
 * directory.spec.ts, against the lists the run seeds.
 */
test('the editor verifies a draft and sends whoever would publish it to the beta', async ({ page }) => {
  await installExtension(page, 'e2e founder')

  await page.goto('/new/')
  await page.getByRole('link', { name: /Links & text/ }).click()
  await expect(page.getByRole('heading', { name: 'New list' })).toBeVisible()

  // The verifier speaks up until the identity is there.
  await expect(page.getByText('Name is required.').first()).toBeVisible()
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Founded on the page')
  await page.getByRole('textbox', { name: 'Description', exact: true }).fill('A list made in the editor, curated by whoever signed it.')
  await expect(page.getByText('Name at least one relay').first()).toBeVisible()
  await page.getByRole('button', { name: '+ ws://localhost:10547' }).click()
  await expect(page.getByText('This is a usable schema.')).toBeVisible()

  // The template's fields are there; a field can be added and one removed, but never the title.
  await expect(page.getByRole('list').last().locator('li')).toHaveCount(6)
  await page.getByRole('button', { name: '+ Year' }).click()
  await expect(page.getByRole('list').last().locator('li')).toHaveCount(7)
  await expect(page.getByRole('button', { name: 'Remove field' }).nth(1)).toBeDisabled()

  // Nothing is signed here: the usable schema ends in the beta, in a new tab,
  // behind Apple's badge.
  const join = page.getByRole('link', { name: 'Download on the App Store' })
  await expect(join).toHaveAttribute('href', CURARE_TESTFLIGHT_URL)
  await expect(join).toHaveAttribute('target', '_blank')
  await expect(page.getByRole('button', { name: /publish/i })).toHaveCount(0)
})
