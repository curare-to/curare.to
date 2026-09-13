/* NIP-11: what a relay says about itself, fetched once per relay over https
 * with `Accept: application/nostr+json`. The site reads `supported_nips` to
 * learn whether NIP-45 counts are there; everything else is for the viewer. */

export interface RelayInfo {
  url: string
  name: string | null
  description: string | null
  supportedNips: number[]
  /** Fetched and readable, or not — a relay with no document supports nothing we can ask about. */
  reachable: boolean
}

const cache = new Map<string, Promise<RelayInfo>>()

export function relayInfo(url: string, fetchImpl: typeof fetch = (...a) => fetch(...a)): Promise<RelayInfo> {
  let pending = cache.get(url)
  if (!pending) {
    pending = (async () => {
      const unreachable: RelayInfo = { url, name: null, description: null, supportedNips: [], reachable: false }
      let http: string
      try {
        const parsed = new URL(url)
        parsed.protocol = parsed.protocol === 'ws:' ? 'http:' : 'https:'
        http = parsed.toString()
      } catch {
        return unreachable
      }
      try {
        const response = await fetchImpl(http, { headers: { Accept: 'application/nostr+json' } })
        if (!response.ok) return unreachable
        const body = (await response.json()) as { name?: unknown; description?: unknown; supported_nips?: unknown }
        const nips = Array.isArray(body.supported_nips) ? body.supported_nips.filter((n): n is number => typeof n === 'number') : []
        return {
          url,
          name: typeof body.name === 'string' ? body.name : null,
          description: typeof body.description === 'string' ? body.description : null,
          supportedNips: nips,
          reachable: true,
        }
      } catch {
        return unreachable
      }
    })()
    cache.set(url, pending)
  }
  return pending
}

export async function supportsNip(url: string, nip: number): Promise<boolean> {
  return (await relayInfo(url)).supportedNips.includes(nip)
}

export function clearRelayInfo(): void {
  cache.clear()
}
