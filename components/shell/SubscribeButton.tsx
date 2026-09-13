'use client'

import { useState } from 'react'
import type { CuratedSchema } from '@/lib/protocol/curated'
import { curatedSchemaAddress } from '@/lib/protocol/curated'
import { sessionStore, useSession } from '@/lib/store/session'
import { subscriptionStore, useSubscriptions } from '@/lib/store/subscriptionStore'

/** Subscribe to a list — publicly, or privately through the extension's NIP-44 — and the home page becomes yours. */
export function SubscribeButton({ schema }: { schema: CuratedSchema }) {
  const session = useSession()
  const subs = useSubscriptions()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const coordinate = curatedSchemaAddress(schema)
  if (!coordinate) return null
  const current = subs.subscriptions.find((s) => s.coordinate === coordinate)

  async function run(action: () => Promise<void>) {
    setError(null)
    setBusy(true)
    try {
      if (!session.pubkey) {
        const pubkey = await sessionStore.signIn()
        if (!pubkey) {
          setError('Sign in to subscribe.')
          return
        }
      }
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your subscriptions.')
    } finally {
      setBusy(false)
    }
  }

  const relay = schema.relays[0] ?? ''
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm">
      {current ? (
        <button type="button" disabled={busy} onClick={() => run(() => subscriptionStore.unsubscribeFrom(coordinate))} className="rounded-md border border-line px-3 py-1.5 text-ink hover:border-line-strong disabled:opacity-50">
          {busy ? 'Signing…' : `Subscribed${current.private ? ' (private)' : ''} ✓`}
        </button>
      ) : (
        <>
          <button type="button" disabled={busy} onClick={() => run(() => subscriptionStore.subscribeTo(coordinate, relay))} className="rounded-md border border-line px-3 py-1.5 text-ink hover:border-line-strong disabled:opacity-50">
            {busy ? 'Signing…' : 'Subscribe'}
          </button>
          <button type="button" disabled={busy} onClick={() => run(() => subscriptionStore.subscribeTo(coordinate, relay, true))} className="text-xs text-muted hover:text-ink disabled:opacity-50" title="Kept in your list encrypted to yourself (NIP-44), so nobody else sees it.">
            privately
          </button>
        </>
      )}
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </span>
  )
}
