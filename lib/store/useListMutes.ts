'use client'

import { useEffect, useMemo } from 'react'
import type { CuratedSchema } from '@/lib/protocol/curated'
import { mergeMutes, type Mutes } from '@/lib/protocol/mutes'
import { muteStore, useMutes } from './muteStore'
import { useSession } from './session'

/** The curator's mute list applies inside their list — bans — and the viewer's everywhere. */
export function useListMutes(schema: CuratedSchema): { merged: Mutes; curator: Mutes; viewer: Mutes } {
  const session = useSession()
  useEffect(() => {
    muteStore.self = session.pubkey
    muteStore.addRelays(schema.relays)
  }, [session.pubkey, schema.relays])
  const curator = useMutes(schema.namespace)
  const viewer = useMutes(session.pubkey)
  const merged = useMemo(() => mergeMutes(curator, viewer), [curator, viewer])
  return { merged, curator, viewer }
}
