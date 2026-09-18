import { expect, test } from '@playwright/test'
import { COUNTDOWN_TARGET, COUNTDOWN_WHEN } from '../lib/countdown'

const TARGET = Date.parse(COUNTDOWN_TARGET)
const SECOND = 1000
const DAY = 86_400 * SECOND

/**
 * The home page is a countdown to the moment lib/countdown.ts names, and
 * the feed that was there lives at /landing/ (directory.spec.ts covers it).
 * The clock is Playwright's and the times are taken from the target, so
 * this passes on either side of the moment, wherever it is put.
 */
test('the home page counts down to the moment, and opens onto the feed when it comes', async ({ page }) => {
  // A morning three and a half days out. Time flows until paused.
  const morning = TARGET - 3 * DAY - (12 * 3600 + 21 * 60) * SECOND
  await page.clock.install({ time: morning })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: `${COUNTDOWN_WHEN.date} · ${COUNTDOWN_WHEN.time}` })).toBeVisible()
  await expect(page.getByText('where you are.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Come in' })).toHaveCount(0)
  // Alone on the page: no header, no footer.
  await expect(page.getByRole('banner')).toHaveCount(0)
  await expect(page.getByRole('contentinfo')).toHaveCount(0)

  // To the second, and ticking with the clock.
  await page.clock.pauseAt(morning + 30 * SECOND)
  const timer = page.getByRole('timer')
  await expect(timer).toHaveText(/^03\s*days\s*12\s*hours\s*20\s*minutes\s*30\s*seconds$/)
  await page.clock.runFor(SECOND)
  await expect(timer).toHaveText(/^03\s*days\s*12\s*hours\s*20\s*minutes\s*29\s*seconds$/)

  // The moment comes: zeros, and a way in.
  await page.clock.pauseAt(TARGET)
  await expect(page.getByRole('heading', { name: 'It’s time.' })).toBeVisible()
  await expect(timer).toHaveText(/^00\s*days\s*00\s*hours\s*00\s*minutes\s*00\s*seconds$/)
  await page.clock.resume()
  await page.getByRole('link', { name: 'Come in' }).click()
  await expect(page).toHaveURL(/\/landing\/$/)
  await expect(page.getByRole('heading', { name: 'Across the newest lists' })).toBeVisible()
  await expect(page.getByRole('banner')).toBeVisible()
  await expect(page.getByRole('contentinfo')).toBeVisible()
})
