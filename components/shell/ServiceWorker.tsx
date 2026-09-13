'use client'

import { useEffect } from 'react'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

/** Register public/sw.js in production, so the export loads from this device once seen. Failures are ignored: the site works without it. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register(`${BASE}/sw.js`, { scope: `${BASE}/` }).catch(() => {})
  }, [])
  return null
}
