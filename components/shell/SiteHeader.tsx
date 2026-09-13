import Link from 'next/link'
import { SignIn } from './SignIn'

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
        <Link href="/" className="font-semibold tracking-tight text-ink no-underline">
          curare.to
        </Link>
        <span className="hidden text-sm text-muted sm:inline">{process.env.NEXT_PUBLIC_SINGLE_LIST ? 'a curated list on Nostr' : 'curated lists on Nostr'}</span>
        <nav className="ml-auto flex items-center gap-4 text-sm">
          {process.env.NEXT_PUBLIC_SINGLE_LIST ? null : (
            <Link href="/new/" className="text-ink-2 no-underline hover:text-ink">
              New list
            </Link>
          )}
          <SignIn />
        </nav>
      </div>
    </header>
  )
}
