'use client'

import { useEffect, useState } from 'react'
import { cacheKey, resolveSchemaCached, type Resolution } from '@/lib/resolve/schema'
import type { ListRef } from '@/lib/routes'

export type ResolvedState = { status: 'loading' } | Resolution

/** Resolve a list address once per page load and share it (see lib/resolve/schema.ts). */
export function useResolvedSchema(ref: ListRef): ResolvedState {
  const key = cacheKey(ref)
  const [state, setState] = useState<{ key: string; value: ResolvedState }>({ key, value: { status: 'loading' } })

  useEffect(() => {
    let cancelled = false
    resolveSchemaCached(ref).then((value) => {
      if (!cancelled) setState({ key, value })
    })
    return () => {
      cancelled = true
    }
    // The ref is identified by its cache key; a new object with the same key is the same address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return state.key === key ? state.value : { status: 'loading' }
}
