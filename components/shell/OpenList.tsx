'use client'

import { useState, type FormEvent } from 'react'
import { isValidDomain, normalizeDomain } from '@/lib/protocol/curated'
import { withBase } from '@/lib/router'
import { buildPath, parseCurator, parseNaddr } from '@/lib/routes'

/** A box that turns "bitcoin.mov", "naddr1…", "npub1… things" or "_@site.example things" into a list address. */
export function OpenList() {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const parts = value.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 1) {
      const address = parseNaddr(parts[0].replace(/^nostr:/i, ''))
      if (address) {
        window.location.assign(withBase(buildPath({ kind: 'list', list: address, tab: 'front' })))
        return
      }
      const domain = normalizeDomain(parts[0])
      if (isValidDomain(domain)) {
        window.location.assign(withBase(buildPath({ kind: 'list', list: { by: 'domain', domain }, tab: 'front' })))
        return
      }
      setError('A domain looks like bitcoin.mov; an address is an naddr1…, or an npub or name@domain followed by the list identifier.')
      return
    }
    if (parts.length === 2) {
      const curator = parseCurator(parts[0])
      if (curator) {
        window.location.assign(
          withBase(buildPath({ kind: 'list', list: { by: 'coordinate', curator, identifier: parts[1] }, tab: 'front' })),
        )
        return
      }
    }
    setError('Enter a domain (bitcoin.mov), an naddr1…, or an npub or name@domain followed by the list identifier.')
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-start gap-2">
      <label className="sr-only" htmlFor="open-list">
        List address
      </label>
      <input
        id="open-list"
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setError(null)
        }}
        placeholder="bitcoin.mov — or naddr1…, or npub1… identifier"
        className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <button type="submit" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-ink">
        Open
      </button>
      {error ? <p className="w-full text-sm text-danger">{error}</p> : null}
    </form>
  )
}
