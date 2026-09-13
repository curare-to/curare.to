'use client'

import { useState, useSyncExternalStore } from 'react'
import { directoryRelays, setDirectoryRelays, subscribeDirectoryRelays, READ_RELAYS } from '@/lib/nostr/relays'
import { isRelayUrl } from '@/lib/protocol/curated'

/**
 * The directory relays are a setting: where schemas are looked up, where the
 * directory scans, and the fallback for a list that names no relay. The
 * built-in list is a default and relay.curare.to a cache, not an authority.
 */
export function RelaySettings() {
  const relays = useSyncExternalStore(subscribeDirectoryRelays, () => directoryRelays(), () => READ_RELAYS)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const isDefault = relays === READ_RELAYS

  return (
    <section className="rounded-lg border border-line bg-surface p-4 text-sm">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Directory relays</h2>
      <p className="mt-1 text-xs text-muted">
        Where lists are looked up and the directory reads from. A list&apos;s own posts always come from the relays its schema names.
        {isDefault ? ' This is the built-in list.' : ' This is your own list.'}
      </p>
      <ul className="mt-2 space-y-1 font-mono text-xs">
        {relays.map((r) => (
          <li key={r} className="flex items-center gap-2">
            <span className="flex-1 break-all">{r}</span>
            <button type="button" onClick={() => setDirectoryRelays(relays.filter((x) => x !== r))} className="text-muted hover:text-danger">
              remove
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const url = text.trim()
          if (!isRelayUrl(url)) {
            setError('A relay is a ws:// or wss:// URL.')
            return
          }
          setError(null)
          setDirectoryRelays([...relays, url])
          setText('')
        }}
        className="mt-2 flex flex-wrap gap-2"
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="wss://…" aria-label="Directory relay" className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-1.5 font-mono text-xs focus:border-accent focus:outline-none" />
        <button type="submit" className="rounded-md border border-line px-3 py-1.5 hover:border-line-strong">
          Add
        </button>
        {!isDefault ? (
          <button type="button" onClick={() => setDirectoryRelays(null)} className="text-xs text-muted hover:text-ink">
            Back to the default
          </button>
        ) : null}
      </form>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
      <p className="mt-2 text-xs text-muted">Takes effect on the next page load.</p>
    </section>
  )
}
