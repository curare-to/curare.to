import { expect, test } from '@playwright/test'
import { nip19 } from 'nostr-tools'
import { CURATOR, IDENTIFIER } from './list'

const NPUB = nip19.npubEncode(CURATOR)
const LIST = `/r/${NPUB}/${IDENTIFIER}/`

test('a sub renders at its coordinate: front page, new tab, and a post', async ({ page }) => {
  await page.goto(LIST)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Things worth a look')
  // Five curated posts on the front page, newest first.
  await expect(page.locator('article')).toHaveCount(5)
  await expect(page.locator('article').first()).toContainText('Thing number 5')
  await expect(page.getByText('5 on the front page')).toBeVisible()
  await expect(page.getByText('12 suggested')).toBeVisible()

  // The flair filter narrows the page.
  await page.getByRole('button', { name: /^essay/ }).click()
  await expect(page.locator('article')).toHaveCount(2)
  await page.getByRole('button', { name: 'All' }).click()

  // The New tab is client-side navigation: every post, with its state.
  await page.evaluate(() => {
    ;(window as unknown as { __same?: boolean }).__same = true
  })
  await page.getByRole('link', { name: 'New', exact: true }).click()
  await expect(page).toHaveURL(/\?tab=new$/)
  await expect(page.locator('article')).toHaveCount(12)
  await expect(page.locator('article', { hasText: 'Thing number 12' })).toContainText('pending')
  await expect(page.locator('article', { hasText: 'Thing number 3' })).toContainText('curated')
  expect(await page.evaluate(() => (window as unknown as { __same?: boolean }).__same)).toBe(true)

  // A post page: title, link, body with a safe link, and who suggested it.
  await page.locator('article', { hasText: 'Thing number 4' }).getByRole('link', { name: 'Thing number 4' }).click()
  await expect(page).toHaveURL(new RegExp(`${IDENTIFIER}/thing-4/$`))
  await expect(page.getByRole('heading', { level: 1, name: 'Thing number 4' })).toBeVisible()
  await expect(page.getByRole('link', { name: /example\.org ↗/ })).toHaveAttribute('href', 'https://example.org/things/4')
  await expect(page.getByRole('link', { name: 'https://example.org/notes/4' })).toHaveAttribute('rel', /noopener/)
  await expect(page.locator('article header')).toContainText('curated by')
  await expect(page.getByText('Suggested by')).toBeVisible()
})

test('an address with no usable schema says so', async ({ page }) => {
  await page.goto(`/r/${NPUB}/nothing-here/`)
  await expect(page.getByRole('heading', { name: 'Not a list' })).toBeVisible()
  await expect(page.getByText(/no usable schema "nothing-here"/)).toBeVisible()
})

test('a path that is neither a sub nor a person is not found', async ({ page }) => {
  await page.goto('/r/')
  await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible()
})
