import { expect, test } from '@playwright/test'
import { nip19 } from 'nostr-tools'
import { SimplePool } from 'nostr-tools/pool'
import { signedBy } from '../test/keys'
import { installExtension } from './extension'
import { COMMENT_ADDRESS, COMMENT_LIST, CURATOR, RELAY, commentPost } from './list'

const LIST = `/r/${nip19.npubEncode(CURATOR)}/${COMMENT_LIST}/`

test('a comment on a queued post is still under it after the curator curates it', async ({ page }) => {
  await installExtension(page, 'e2e commenter')

  // The post is pending: comment on it while it sits in the queue.
  await page.goto(`${LIST}the-one/`)
  await expect(page.locator('article header')).toContainText('pending')
  await page.getByRole('textbox', { name: 'Comment' }).fill('Worth curating — see https://example.org/why/9')
  await page.getByRole('button', { name: 'Sign in and comment' }).click()
  await expect(page.getByRole('heading', { name: '1 comment' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'https://example.org/why/9' })).toBeVisible()

  // A reply, nested under it.
  await page.getByRole('button', { name: 'Reply' }).click()
  await page.getByRole('textbox', { name: 'Reply' }).fill('Agreed.')
  await page.getByRole('button', { name: 'Reply', exact: true }).last().click()
  await expect(page.getByRole('heading', { name: '2 comments' })).toBeVisible()
  await expect(page.locator('ol ol li')).toContainText('Agreed.')

  // The curator curates it — the canonical entry lands on the relay from outside the page.
  const suggestion = commentPost()
  const canonical = signedBy('e2e curator', {
    kind: 31890,
    tags: [
      ...suggestion.tags.filter((t) => t[0] !== 'p' || t[1] === CURATOR),
      ['a', `31888:${suggestion.pubkey}:the-one`, RELAY, 'mention'],
      ['e', suggestion.id, RELAY, 'mention'],
      ['p', suggestion.pubkey],
    ],
    content: suggestion.content,
    created_at: Math.floor(Date.now() / 1000),
  })
  const pool = new SimplePool()
  await Promise.all(pool.publish([RELAY], canonical))
  pool.close([RELAY])

  // Reloaded, the post is curated and the thread — rooted at the suggestion — is still its thread.
  await page.reload()
  await expect(page.locator('article header')).toContainText('curated')
  await expect(page.getByRole('heading', { name: '2 comments' })).toBeVisible()
  await expect(page.getByText('Worth curating')).toBeVisible()

  // A comment left now roots at the canonical entry and joins the same thread.
  await page.getByRole('textbox', { name: 'Comment' }).fill('Glad it made it.')
  await page.getByRole('button', { name: 'Comment', exact: true }).click()
  await expect(page.getByRole('heading', { name: '3 comments' })).toBeVisible()

  // The front page shows the count.
  await page.goto(LIST)
  await expect(page.locator('article', { hasText: 'The one that gets curated' })).toContainText('3 comments')
  expect(COMMENT_ADDRESS).toContain(CURATOR)
})
