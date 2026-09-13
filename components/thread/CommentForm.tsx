'use client'

import { useState, type FormEvent } from 'react'
import type { Event } from 'nostr-tools/pure'
import { buildCommentTemplate, type Comment, type CommentRoot } from '@/lib/protocol/comments'
import { Nip07Error, signAndPublish } from '@/lib/nostr/nip07'
import { sessionStore, useSession } from '@/lib/store/session'

/** A comment on the post, or a reply to one of its comments. Signed in the extension; sent to the sub's relays. */
export function CommentForm({
  root,
  parent,
  relays,
  onPublished,
  onCancel,
  autoFocus,
}: {
  root: CommentRoot
  parent?: Comment | null
  relays: string[]
  onPublished: (event: Event) => void
  onCancel?: () => void
  autoFocus?: boolean
}) {
  const session = useSession()
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!content.trim()) {
      setError('Say something first.')
      return
    }
    const pubkey = session.pubkey ?? (await sessionStore.signIn())
    if (!pubkey) {
      setError('Sign in with a NIP-07 extension to comment.')
      return
    }
    setBusy(true)
    try {
      const template = buildCommentTemplate({ root, parent, content })
      const targets = [...new Set([...relays, ...session.writeRelays])]
      const { signed } = await signAndPublish(template, targets)
      setContent('')
      onPublished(signed)
    } catch (err) {
      setError(err instanceof Nip07Error ? err.message : 'Something went wrong while publishing.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={parent ? 3 : 4}
        maxLength={10_000}
        autoFocus={autoFocus}
        placeholder={parent ? 'Reply…' : 'Add a comment…'}
        aria-label={parent ? 'Reply' : 'Comment'}
        className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
      />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-ink disabled:opacity-50"
        >
          {busy ? 'Signing…' : session.pubkey ? (parent ? 'Reply' : 'Comment') : 'Sign in and comment'}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} className="text-sm text-muted hover:text-ink">
            Cancel
          </button>
        ) : null}
        <span className="text-xs text-muted">Plain text; links are linked, nothing else is interpreted.</span>
      </div>
    </form>
  )
}
