import { OpenList } from '@/components/shell/OpenList'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

export default function HomePage() {
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
          — the list bitcoin.mov is built on, read from the same relay it reads from.
        </p>
      </div>
    </div>
  )
}
