import { expect, test } from '@playwright/test'
import { nip19 } from 'nostr-tools'
import { CURATOR, IDENTIFIER } from './list'

/** The single-list build: this site is the run's main list, and its home page is the list's front page. */
test('built for one list, the home page is that list', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Things worth a look')
  await expect(page.locator('article')).toHaveCount(5)
  await expect(page.getByText('5 on the front page')).toBeVisible()
  // In the site's chrome — no countdown here — with no directory and no New list: one list.
  await expect(page.getByRole('banner')).toBeVisible()
  await expect(page.getByRole('link', { name: 'New list' })).toHaveCount(0)
  await expect(page.getByRole('contentinfo')).toBeVisible()

  // The tabs stay on the home page; entries live at their coordinate, which the shell serves.
  await page.getByRole('link', { name: 'New', exact: true }).click()
  await expect(page).toHaveURL(/\/\?tab=new$/)
  await expect(page.locator('article')).toHaveCount(12)
  await page.locator('article', { hasText: 'Thing number 12' }).getByRole('link', { name: 'Thing number 12' }).click()
  await expect(page).toHaveURL(new RegExp(`/r/${nip19.npubEncode(CURATOR)}/${IDENTIFIER}/thing-12/$`))
  await expect(page.getByRole('heading', { level: 1, name: 'Thing number 12' })).toBeVisible()
})
