'use client'

import { useState } from 'react'
import { sessionStore, useSession } from '@/lib/store/session'
import { displayNameOf, useProfile } from '@/lib/store/profileStore'
import { userPath } from '@/lib/routes'
import { withBase } from '@/lib/router'

/** The header's sign-in state: a button, a hint when there is no extension, or who you are. */
export function SignIn() {
  const session = useSession()
  const profile = useProfile(session.pubkey)
  const [busy, setBusy] = useState(false)

  if (session.status === 'checking') return <span className="text-sm text-muted">…</span>

  if (session.status === 'signed-in') {
    return (
      <span className="flex items-center gap-3 text-sm">
        <a href={withBase(userPath(session.pubkey))} className="flex items-center gap-1.5 text-ink no-underline hover:underline">
          {profile?.picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.picture} alt="" className="h-5 w-5 rounded-full object-cover" />
          ) : null}
          {displayNameOf(profile, session.pubkey)}
        </a>
        <button type="button" onClick={sessionStore.signOut} className="text-muted hover:text-ink">
          Sign out
        </button>
      </span>
    )
  }

  if (!session.extension) {
    return (
      <span className="text-sm text-muted" title="A NIP-07 extension such as Alby or nos2x holds your key; this site never sees it.">
        No signer found
      </span>
    )
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await sessionStore.signIn()
        } finally {
          setBusy(false)
        }
      }}
      className="rounded-md border border-line px-3 py-1.5 text-sm text-ink hover:border-line-strong disabled:opacity-50"
    >
      Sign in
    </button>
  )
}
