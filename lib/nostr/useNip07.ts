'use client'

import { useCallback, useEffect, useState } from 'react'
import { getNip07 } from './nip07'

type Availability = 'checking' | 'available' | 'unavailable'

/**
 * Detect a NIP-07 signer and expose the connected pubkey.
 *
 * Extensions inject `window.nostr` asynchronously after page load, so we poll
 * briefly before concluding one isn't present. All of this runs client-side in
 * an effect — never during render — so it can't cause a hydration mismatch.
 */
export function useNip07() {
  const [availability, setAvailability] = useState<Availability>('checking')
  const [pubkey, setPubkey] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let tries = 0

    const check = () => {
      if (cancelled) return
      if (getNip07()) {
        setAvailability('available')
        return
      }
      tries += 1
      if (tries >= 6) {
        setAvailability('unavailable')
        return
      }
      setTimeout(check, 250)
    }

    check()
    return () => {
      cancelled = true
    }
  }, [])

  const connect = useCallback(async (): Promise<string | null> => {
    const provider = getNip07()
    if (!provider) {
      setAvailability('unavailable')
      return null
    }
    try {
      const pk = await provider.getPublicKey()
      setPubkey(pk)
      setAvailability('available')
      return pk
    } catch {
      return null
    }
  }, [])

  return { availability, pubkey, connect }
}
