'use client'

import { useMemo } from 'react'
import type { CuratedSchema } from '@/lib/protocol/curated'
import { otherWeightFor, weightFor, type VoteMode } from '@/lib/rank/wot'
import { useFollows } from './followStore'
import { usePreferences } from './preferences'
import { useSession } from './session'

export interface Weighting {
  weight: (pubkey: string) => number
  viewer: string | null
  mode: VoteMode
  /** Whose follow list the trust comes from. */
  trustedFrom: 'you' | 'the curator'
  trustedCount: number
}

/**
 * The viewer's weighting (decision 7): their own follows when signed in,
 * the curator's when not; the mode from preferences.
 */
export function useWeighting(schema: CuratedSchema): Weighting {
  const session = useSession()
  const { votes: mode } = usePreferences()
  const anchor = session.pubkey ?? schema.namespace
  const follows = useFollows(anchor)
  return useMemo(
    () => ({
      weight: weightFor(follows, session.pubkey, otherWeightFor(mode)),
      viewer: session.pubkey,
      mode,
      trustedFrom: session.pubkey ? 'you' : 'the curator',
      trustedCount: follows.size,
    }),
    [follows, session.pubkey, mode],
  )
}
