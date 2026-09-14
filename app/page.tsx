import { Suspense } from 'react'
import { SingleListHome } from '@/components/shell/SingleListHome'
import { Countdown } from '@/components/shell/Countdown'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

/**
 * Built with NEXT_PUBLIC_SINGLE_LIST, the site is one list and this is its
 * front page. The value is the signed schema's path (same origin, usually
 * /.well-known/curare.to/nostr.json) or URL; a relative path gets the base
 * path, the way every same-origin fetch here does. Otherwise the home page
 * is a countdown to Friday 18 September 2026, 21:21 UTC (lib/countdown.ts),
 * and the feed that was here lives at /landing/.
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
  return <Countdown />
}
