import { expect, test } from '@playwright/test'
import { nip19 } from 'nostr-tools'
import { SimplePool } from 'nostr-tools/pool'
import { buildReactionTemplate } from '../lib/protocol/reactions'
import { signedBy } from '../test/keys'
import { installExtension } from './extension'
import { CURATOR, IDENTIFIER, RELAY, posts } from './list'

const LIST = `/r/${nip19.npubEncode(CURATOR)}/${IDENTIFIER}/`

test('votes reorder the front page, the number says which count it is, and a vote is one click', async ({ page }) => {
  await installExtension(page, 'e2e voter')

  // Three people upvote thing 2 and one downvotes thing 5, from outside the page.
  const { canonicals } = posts()
  const thing = (n: number) => canonicals.find((c) => c.tags.some((t) => t[0] === 'd' && t[1] === `thing-${n}`))!
  const pool = new SimplePool()
  const now = Math.floor(Date.now() / 1000)
  const votes = [
    signedBy('e2e v1', buildReactionTemplate({ target: thing(2), direction: 'up', createdAt: now })),
    signedBy('e2e v2', buildReactionTemplate({ target: thing(2), direction: 'up', createdAt: now })),
    signedBy('e2e v3', buildReactionTemplate({ target: thing(2), direction: 'up', createdAt: now })),
    signedBy('e2e v4', buildReactionTemplate({ target: thing(5), direction: 'down', createdAt: now })),
  ]
  await Promise.all(votes.flatMap((v) => pool.publish([RELAY], v)))
  pool.close([RELAY])

  await page.goto(LIST)
  await expect(page.locator('article')).toHaveCount(5)
  // Hot: three votes on the oldest post outrank a few minutes of age.
  await expect(page.locator('article').first()).toContainText('Thing number 2')
  await expect(page.locator('article', { hasText: 'Thing number 2' }).getByLabel(/^Score/)).toHaveText('3')
  await expect(page.locator('article', { hasText: 'Thing number 5' }).getByLabel(/^Score/)).toHaveText('-1')
  // One downvote does not move hot (log10 of 1 is 0, as on reddit); the rest is age order, oldest last.
  await expect(page.locator('article').last()).toContainText('Thing number 1')

  // The hover says which count it is.
  await expect(page.locator('article', { hasText: 'Thing number 2' }).locator('[title*="everyone"]').first()).toBeAttached()

  // New puts the newest first regardless; Top agrees with Hot here.
  await page.getByRole('button', { name: 'New' }).click()
  await expect(page.locator('article').first()).toContainText('Thing number 5')
  await page.getByRole('button', { name: 'Top' }).click()
  await expect(page.locator('article').first()).toContainText('Thing number 2')
  await expect(page.locator('article').last()).toContainText('Thing number 5')

  // Only trusted: signed out, the curator follows nobody, so every count is 0 and the order falls back to age.
  await page.getByRole('button', { name: 'Only trusted' }).click()
  await expect(page.locator('article', { hasText: 'Thing number 2' }).getByLabel(/^Score/)).toHaveText('0')
  await page.getByRole('button', { name: 'Everyone' }).click()

  // The viewer votes: one click, signed in the extension, counted at once.
  await page.locator('article', { hasText: 'Thing number 3' }).getByRole('button', { name: 'Upvote' }).click()
  await expect(page.locator('article', { hasText: 'Thing number 3' }).getByLabel(/^Score/)).toHaveText('1')
  await expect(page.locator('article', { hasText: 'Thing number 3' }).getByRole('button', { name: 'Upvote' })).toHaveAttribute('aria-pressed', 'true')

  // Changing the vote replaces it rather than adding to it.
  await page.locator('article', { hasText: 'Thing number 3' }).getByRole('button', { name: 'Downvote' }).click()
  await expect(page.locator('article', { hasText: 'Thing number 3' }).getByLabel(/^Score/)).toHaveText('-1')

  // The post page carries the same tally, and a comment can be voted on too.
  await page.locator('article', { hasText: 'Thing number 2' }).getByRole('link', { name: 'Thing number 2' }).click()
  await expect(page.locator('article header').getByLabel(/^Score/)).toHaveText('3')
})
