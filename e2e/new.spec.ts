import { expect, test } from '@playwright/test'
import { installExtension } from './extension'

test('a list made on /new/ accepts a post from a second browser', async ({ page, browser }) => {
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

  await page.getByRole('button', { name: 'Sign in and publish' }).click()
  await expect(page.getByRole('heading', { name: 'Published' })).toBeVisible()
  await page.getByRole('link', { name: 'Open the list' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Founded on the page')
  await expect(page.getByText('0 on the front page')).toBeVisible()
  const listUrl = page.url()

  // The founder is the curator (still signed in — the session survives a navigation): the sidebar offers
  // the schema for editing, and the queue tab is theirs.
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Edit the schema' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Queue ✎' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Download for your own domain' })).toHaveAttribute('download', 'nostr.json')

  // Somebody else, in another browser, posts to it.
  const other = await browser.newContext()
  const second = await other.newPage()
  await installExtension(second, 'e2e second browser')
  await second.goto(listUrl)
  await second.getByRole('link', { name: 'Suggest' }).click()
  await second.getByLabel(/^Title/).fill('First post on a new list')
  await second.getByLabel(/^Link/).fill('https://example.org/first')
  await second.getByRole('button', { name: 'Sign in and publish' }).click()
  await expect(second.getByRole('heading', { name: 'Published' })).toBeVisible()
  await other.close()

  // The founder sees it in the queue and puts it on the front page.
  await page.goto(`${listUrl}?tab=queue`)
  await expect(page.getByRole('heading', { name: 'Pending (1)' })).toBeVisible()
  await page.locator('article', { hasText: 'First post on a new list' }).getByRole('button', { name: 'Approve', exact: true }).click()
  await page.getByRole('link', { name: 'Front page' }).click()
  await expect(page.locator('article', { hasText: 'First post on a new list' })).toBeVisible()
  // The link rule: a link post's identifier is the link's hash.
  await expect(page.locator('article').first().getByRole('link', { name: 'First post on a new list' })).toHaveAttribute('href', /\/url%3A[0-9a-f]{16}\/$/)
})
