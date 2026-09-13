import { Suspense } from 'react'
import { OpenList } from '@/components/shell/OpenList'
import { SingleListHome } from '@/components/shell/SingleListHome'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

/**
 * Built with NEXT_PUBLIC_SINGLE_LIST, the site is one list and this is its
 * front page. The value is the signed schema's path (same origin, usually
 * /.well-known/curare.to/nostr.json) or URL; a relative path gets the base
 * path, the way every same-origin fetch here does.
 */
const SINGLE = process.env.NEXT_PUBLIC_SINGLE_LIST
  ? process.env.NEXT_PUBLIC_SINGLE_LIST.startsWith('/')
    ? `${BASE}${process.env.NEXT_PUBLIC_SINGLE_LIST}`
    : process.env.NEXT_PUBLIC_SINGLE_LIST
  : null

export default function HomePage() {
  if (SINGLE) {
    return (
      <Suspense fallback={<p className="py-16 text-center text-muted">Loading…</p>}>
        <SingleListHome url={SINGLE} />
      </Suspense>
    )
  }
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Curated lists, read from Nostr.</h1>
      <p className="mt-4 max-w-prose text-ink-2">
        A sub is a schema its curator signed; a post on its front page is an entry the curator signed; everything
        anyone suggested is the queue behind it. This site holds nothing — it reads the relays a list names and
        verifies every event against the schema before showing it.
      </p>
      <div className="mt-8 space-y-3">
        <p className="text-sm text-muted">Open a list by its domain, or by its curator and identifier:</p>
        <OpenList />
        <p className="text-sm text-muted">
          For example,{' '}
          <a href={`${BASE}/r/bitcoin.mov/`} className="text-accent-ink underline">
            /r/bitcoin.mov
          </a>{' '}
          — the list bitcoin.mov is built on, read from the same relay it reads from. Or{' '}
          <a href={`${BASE}/new/`} className="text-accent-ink underline">
            start a list
          </a>{' '}
          of your own.
        </p>
      </div>
    </div>
  )
}
