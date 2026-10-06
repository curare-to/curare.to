import { expect, test } from '@playwright/test'
import { COUNTDOWN_TARGET, COUNTDOWN_WHEN } from '../lib/countdown'

const TARGET = Date.parse(COUNTDOWN_TARGET)
const SECOND = 1000
const DAY = 86_400 * SECOND

/**
 * The home page is a countdown to the moment lib/countdown.ts names, and
 * the feed that was there lives at /landing/ (directory.spec.ts covers it).
 * The clock is Playwright's and the times are taken from the target, so
 * these pass on either side of the moment, wherever it is put.
 */
test('the home page counts down to the moment, and gives way to the feed when it comes', async ({ page }) => {
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

  // The moment comes and the page takes the viewer in by itself.
  await page.clock.pauseAt(TARGET)
  await page.clock.resume()
  await expect(page).toHaveURL(/\/landing\/$/)
  await expect(page.getByRole('heading', { name: 'Across the newest lists' })).toBeVisible()
  await expect(page.getByRole('banner')).toBeVisible()
  await expect(page.getByRole('contentinfo')).toBeVisible()
})

/** Whoever comes late never sees the countdown: the home page sends them on. */
test('the home page sends a visitor who arrives after the moment to the feed', async ({ page }) => {
  await page.clock.install({ time: TARGET + 5 * DAY })
  await page.goto('/')
  await expect(page).toHaveURL(/\/landing\/$/)
  await expect(page.getByRole('heading', { name: 'Across the newest lists' })).toBeVisible()
  // Replaced, not pushed: there is no countdown behind us to go back to.
  await page.goBack()
  await expect(page.getByRole('timer')).toHaveCount(0)
})
