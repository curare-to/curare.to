export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-5xl flex-wrap gap-x-6 gap-y-1 px-4 py-4 text-xs text-muted">
        <span>
          Every sub is a kind 31889 schema event; every post on its front page a
          kind 31890 canonical event, read from relays in your browser.
        </span>
        <a
          className="underline hover:text-ink"
          href="https://github.com/curare-to/curare.to"
          rel="noopener noreferrer"
          target="_blank"
        >
          Source
        </a>
      </div>
    </footer>
  )
}
