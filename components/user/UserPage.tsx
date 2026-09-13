'use client'

import { useEffect } from 'react'
import { nip19 } from 'nostr-tools'
import { displayNameOf, useProfile } from '@/lib/store/profileStore'
import { Linkify } from '@/components/ui/Linkify'

/** /u/<npub>/: a person, as their kind 0 describes them. What they have posted comes in later phases. */
export function UserPage({ pubkey }: { pubkey: string }) {
  const profile = useProfile(pubkey)
  const name = displayNameOf(profile, pubkey)
  useEffect(() => {
    document.title = `${name} · curare.to`
  }, [name])

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-start gap-4">
        {profile?.picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.picture} alt="" className="h-20 w-20 rounded-full border border-line object-cover" />
        ) : (
          <div className="h-20 w-20 rounded-full border border-line bg-surface-2" />
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
          {profile?.nip05 ? (
            <p className="text-sm text-muted">
              {profile.nip05}
              {profile.nip05Verified === true ? <span className="ml-1 text-accent">✓</span> : null}
              {profile.nip05Verified === false ? <span className="ml-1" title="The domain does not name this key.">(unverified)</span> : null}
            </p>
          ) : null}
          <p className="mt-1 break-all font-mono text-xs text-muted">{nip19.npubEncode(pubkey)}</p>
          {profile === null ? <p className="mt-3 text-sm text-muted">Looking for a profile…</p> : null}
          {profile && !profile.found ? <p className="mt-3 text-sm text-muted">No profile on the relays this site reads.</p> : null}
          {profile?.about ? (
            <p className="mt-3 max-w-prose whitespace-pre-wrap text-sm text-ink-2">
              <Linkify text={profile.about} />
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
