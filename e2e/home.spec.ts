import { expect, test } from '@playwright/test'

/**
 * The home page is a countdown to Friday 18 September 2026, 21:21 UTC, and
 * the feed that was there lives at /landing/ (directory.spec.ts covers it).
 * The clock is Playwright's, so this passes the same way on either side of
 * the moment.
 */
test('the home page counts down to Friday 21:21 UTC, and opens onto the feed when it comes', async ({ page }) => {
  // A Monday morning, four and a half days out. Time flows until paused.
  await page.clock.install({ time: new Date('2026-09-14T09:00:00Z') })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Friday 18 September 2026 · 21:21 UTC' })).toBeVisible()
  await expect(page.getByText('where you are.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Come in' })).toHaveCount(0)
  // Alone on the page: no header, no footer.
  await expect(page.getByRole('banner')).toHaveCount(0)
  await expect(page.getByRole('contentinfo')).toHaveCount(0)

  // To the second, and ticking with the clock.
  await page.clock.pauseAt(new Date('2026-09-14T09:00:30Z'))
  const timer = page.getByRole('timer')
  await expect(timer).toHaveText(/^04\s*days\s*12\s*hours\s*20\s*minutes\s*30\s*seconds$/)
  await page.clock.runFor(1000)
  await expect(timer).toHaveText(/^04\s*days\s*12\s*hours\s*20\s*minutes\s*29\s*seconds$/)

  // The moment comes: zeros, and a way in.
  await page.clock.pauseAt(new Date('2026-09-18T21:21:00Z'))
  await expect(page.getByRole('heading', { name: 'It’s time.' })).toBeVisible()
  await expect(timer).toHaveText(/^00\s*days\s*00\s*hours\s*00\s*minutes\s*00\s*seconds$/)
  await page.clock.resume()
  await page.getByRole('link', { name: 'Come in' }).click()
  await expect(page).toHaveURL(/\/landing\/$/)
  await expect(page.getByRole('heading', { name: 'Across the newest lists' })).toBeVisible()
  await expect(page.getByRole('banner')).toBeVisible()
  await expect(page.getByRole('contentinfo')).toBeVisible()
})
