'use client'

import { displayNameOf, useProfile } from '@/lib/store/profileStore'
import { userPath } from '@/lib/routes'
import { A } from '@/lib/router'

/** A pubkey as a person: their name when known, a link to their page, a check when their NIP-05 verifies. */
export function ProfileName({ pubkey, className }: { pubkey: string; className?: string }) {
  const profile = useProfile(pubkey)
  const name = displayNameOf(profile, pubkey)
  return (
    <A href={userPath(pubkey)} className={`inline-flex items-center gap-1 text-ink hover:underline ${className ?? ''}`} title={pubkey}>
      {profile?.picture ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.picture} alt="" className="h-4 w-4 rounded-full object-cover" loading="lazy" />
      ) : null}
      <span>{name}</span>
      {profile?.nip05Verified ? (
        <span className="text-accent" title={`Verified: ${profile.nip05}`} aria-label="verified">
          ✓
        </span>
      ) : null}
    </A>
  )
}
