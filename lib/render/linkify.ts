import { isSafeUrl } from '@/lib/protocol/curated'
import { buildPath, parseNaddr, parsePubkey, userPath } from '@/lib/routes'

/* ------------------------------------------------------------------ *
 * Plain text, split into the pieces a post body is rendered from.
 *
 * Pure, so the decisions are testable without a DOM: the text is split on
 * URLs and `nostr:` references, and each piece comes back as text, as a url
 * whose href passed isSafeUrl, or as a reference to a page on this site.
 * Nothing else is interpreted, and a reference this site has no page for
 * stays text — the component never has to decide.
 *
 * `nostr:npub…` names a person, at /u/. `nostr:naddr…` names a list, at its
 * /r/<naddr>/ — only when the address is a kind 31889 schema, which is what
 * parseNaddr refuses anything else for: an naddr for some other kind is some
 * other client's object, and this site has nowhere to send a reader for it.
 * ------------------------------------------------------------------ */

const TOKEN = /(https?:\/\/[^\s<>"'()]+[^\s<>"'().,;:!?]|nostr:(?:npub1|naddr1)[0-9a-z]+)/gi

const SCHEME = 'nostr:'

/** How much of a bech32 reference the link shows before the ellipsis. */
const SHOWN = 12

export type LinkifyPart =
  | { kind: 'text'; text: string }
  /** An off-site link, shown as itself. */
  | { kind: 'url'; url: string }
  /** A `nostr:` reference to a page here: the path to it, and the short form to show. */
  | { kind: 'ref'; href: string; label: string }

/** Where a `nostr:` reference points on this site, or null when no page here names it. */
export function refPath(token: string): string | null {
  const bech32 = token.slice(SCHEME.length).toLowerCase()
  if (bech32.startsWith('npub1')) {
    const pubkey = parsePubkey(bech32)
    return pubkey ? userPath(pubkey) : null
  }
  if (bech32.startsWith('naddr1')) {
    const list = parseNaddr(bech32)
    return list ? buildPath({ kind: 'list', list, tab: 'front' }) : null
  }
  return null
}

/** Split text into the parts it renders as. Never throws. */
export function linkifyParts(text: string): LinkifyPart[] {
  const parts: LinkifyPart[] = []
  const pieces = text.split(TOKEN)
  for (const [i, piece] of pieces.entries()) {
    if (i % 2 === 0) {
      if (piece) parts.push({ kind: 'text', text: piece })
      continue
    }
    if (piece.toLowerCase().startsWith(SCHEME)) {
      const href = refPath(piece)
      parts.push(
        href
          ? { kind: 'ref', href, label: `${piece.slice(SCHEME.length, SCHEME.length + SHOWN)}…` }
          : { kind: 'text', text: piece },
      )
      continue
    }
    parts.push(isSafeUrl(piece) ? { kind: 'url', url: piece } : { kind: 'text', text: piece })
  }
  return parts
}
