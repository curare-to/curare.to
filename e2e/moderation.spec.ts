import { expect, test } from '@playwright/test'
import { nip19 } from 'nostr-tools'
import { installExtension } from './extension'
import { pubkeyOf } from '../test/keys'
import { BAN_LIST, CURATOR } from './list'

const LIST = `/r/${nip19.npubEncode(CURATOR)}/${BAN_LIST}/`

test('a report reaches the queue, a ban empties it of that key for everyone, and the log tells the story', async ({ page, browser }) => {
  // A reader reports a queued post.
  await installExtension(page, 'e2e reader')
  await page.goto(`${LIST}pills/`)
  await page.getByRole('button', { name: 'Report' }).first().click()
  await page.getByLabel('Report type').selectOption('spam')
  await page.getByLabel('Report reason').fill('Sells pills.')
  await page.getByRole('button', { name: 'Send report' }).click()
  await expect(page.getByText('Reported to the curator.')).toBeVisible()

  // The curator sees it in the queue — nobody else does — and bans the poster.
  const curatorContext = await browser.newContext()
  const curator = await curatorContext.newPage()
  await installExtension(curator, 'e2e curator')
  await curator.goto(`${LIST}?tab=queue`)
  await curator.getByRole('button', { name: 'Sign in' }).click()
  const row = curator.locator('article', { hasText: 'Cheap pills here' })
  await expect(row.getByText('1 report')).toBeVisible()
  await expect(row.getByText('spam — Sells pills.')).toBeVisible()

  await curator.getByRole('link', { name: 'Banned', exact: true }).click()
  await curator.getByLabel('Key to ban').fill(nip19.npubEncode(pubkeyOf('e2e bob'))) // the pills' author
  await curator.getByRole('button', { name: 'Ban' }).click()
  await expect(curator.getByRole('heading', { name: 'Banned keys (1)' })).toBeVisible()
  await curator.getByLabel('Word to mute').fill('lottery')
  await curator.getByRole('button', { name: 'Mute word' }).click()
  await expect(curator.getByRole('heading', { name: 'Muted words (1)' })).toBeVisible()

  // The queue folds them away; the log has nothing new (bans are the mute list, not an action here).
  await curator.getByRole('link', { name: 'Queue ✎' }).click()
  await expect(curator.locator('article', { hasText: 'Cheap pills here' })).toHaveCount(0)
  await expect(curator.getByRole('button', { name: /From banned keys or muted words \(2\)/ })).toBeVisible()
  await curatorContext.close()

  // For every viewer, the banned key's post and the muted title vanish from New.
  await page.goto(`${LIST}?tab=new`)
  await expect(page.locator('article', { hasText: 'A fine thing' })).toBeVisible()
  await expect(page.locator('article', { hasText: 'Cheap pills here' })).toHaveCount(0)
  await expect(page.locator('article', { hasText: 'Win the lottery tonight' })).toHaveCount(0)

  // The log: what the curator did, in time order.
  await page.getByRole('link', { name: 'Log' }).click()
  await expect(page.getByText('curated', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('A fine thing', { exact: true }).first()).toBeVisible()
})
