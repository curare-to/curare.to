'use client'

import { useEffect, useState } from 'react'
import { verifyEvent, type Event } from 'nostr-tools/pure'
import { normalizeDomain, parseCuratedSchemaEvent, type CuratedSchema } from '@/lib/protocol/curated'

/* ------------------------------------------------------------------ *
 * A schema's `domain` is a claim. It is verified when both the NIP-05 `_`
 * lookup at that domain names the curator and the domain serves this
 * schema, signed by the curator, at /.well-known/curare.to/nostr.json. Two
 * documents, two different questions — "who am I" and "here is the schema"
 * — and a check passes only when both answer with the same key.
 * ------------------------------------------------------------------ */

export type DomainVerification = 'unclaimed' | 'checking' | 'verified' | 'unverified'

const cache = new Map<string, Promise<DomainVerification>>()

async function nip05Names(domain: string, pubkey: string, fetchImpl: typeof fetch): Promise<boolean> {
  try {
    const response = await fetchImpl(`https://${domain}/.well-known/nostr.json?name=_`)
    if (!response.ok) return false
    const body = (await response.json()) as { names?: Record<string, string> }
    return typeof body?.names?._ === 'string' && body.names._.toLowerCase() === pubkey
  } catch {
    return false
  }
}

async function wellKnownServes(domain: string, schema: CuratedSchema, fetchImpl: typeof fetch): Promise<boolean> {
  try {
    const response = await fetchImpl(`https://${domain}/.well-known/curare.to/nostr.json`, { cache: 'no-cache' })
    if (!response.ok) return false
    const event = (await response.json()) as Event
    if (!event || typeof event !== 'object' || !verifyEvent(event)) return false
    if (event.pubkey !== schema.namespace) return false
    const parsed = parseCuratedSchemaEvent(event)
    return !!parsed && parsed.identifier === schema.identifier
  } catch {
    return false
  }
}

export function verifyClaimedDomain(schema: CuratedSchema, fetchImpl: typeof fetch = (...a) => fetch(...a)): Promise<DomainVerification> {
  if (!schema.domain || !schema.namespace) return Promise.resolve('unclaimed')
  const domain = normalizeDomain(schema.domain)
  const key = `${schema.namespace}:${schema.identifier}:${domain}`
  let pending = cache.get(key)
  if (!pending) {
    pending = Promise.all([nip05Names(domain, schema.namespace, fetchImpl), wellKnownServes(domain, schema, fetchImpl)]).then(
      ([who, what]) => (who && what ? 'verified' : 'unverified'),
    )
    cache.set(key, pending)
  }
  return pending
}

export function clearDomainCache(): void {
  cache.clear()
}

/** The verification state of a schema's domain claim, for the header. */
export function useDomainVerification(schema: CuratedSchema, alreadyVerified: boolean): DomainVerification {
  const [state, setState] = useState<DomainVerification>(alreadyVerified ? 'verified' : schema.domain ? 'checking' : 'unclaimed')
  useEffect(() => {
    if (alreadyVerified || !schema.domain) return
    let cancelled = false
    verifyClaimedDomain(schema).then((result) => {
      if (!cancelled) setState(result)
    })
    return () => {
      cancelled = true
    }
  }, [schema, alreadyVerified])
  return state
}
