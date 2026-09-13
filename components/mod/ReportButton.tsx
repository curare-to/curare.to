'use client'

import { useState } from 'react'
import type { Event } from 'nostr-tools/pure'
import { buildReportTemplate, REPORT_TYPES, type ReportType } from '@/lib/protocol/reports'
import { Nip07Error, signAndPublish } from '@/lib/nostr/nip07'
import { sessionStore, useSession } from '@/lib/store/session'

/** Report a post or comment to the curator: a NIP-56 kind 1984 to the list's relays. */
export function ReportButton({ target, relays, onReported }: { target: Event; relays: string[]; onReported?: (event: Event) => void }) {
  const session = useSession()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<ReportType>('spam')
  const [reason, setReason] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  if (state === 'done') return <span className="text-xs text-muted">Reported to the curator.</span>
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-muted hover:text-ink">
        Report
      </button>
    )
  }

  async function send() {
    setError(null)
    const pubkey = session.pubkey ?? (await sessionStore.signIn())
    if (!pubkey) {
      setError('Sign in to report.')
      return
    }
    setState('busy')
    try {
      const { signed } = await signAndPublish(buildReportTemplate({ target, type, reason }), [...new Set([...relays, ...session.writeRelays])])
      onReported?.(signed)
      setState('done')
    } catch (err) {
      setError(err instanceof Nip07Error ? err.message : 'Could not send the report.')
      setState('idle')
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void send()
      }}
      className="flex flex-wrap items-center gap-2 text-xs"
    >
      <select value={type} onChange={(e) => setType(e.target.value as ReportType)} aria-label="Report type" className="rounded-md border border-line bg-surface px-2 py-1">
        {REPORT_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why (optional)" aria-label="Report reason" className="rounded-md border border-line bg-surface px-2 py-1" />
      <button type="submit" disabled={state === 'busy'} className="rounded-md bg-danger px-2 py-1 font-medium text-white disabled:opacity-50">
        {state === 'busy' ? 'Signing…' : 'Send report'}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-muted hover:text-ink">
        Cancel
      </button>
      {error ? <span className="text-danger">{error}</span> : null}
      <span className="text-muted">Only the curator sees reports.</span>
    </form>
  )
}
