import Link from 'next/link'

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
        <Link href="/" className="font-semibold tracking-tight text-ink no-underline">
          curare.to
        </Link>
        <span className="text-sm text-muted">curated lists on Nostr</span>
      </div>
    </header>
  )
}
