import { nip19 } from 'nostr-tools'
import { isSafeUrl } from '@/lib/protocol/curated'
import { userPath } from '@/lib/routes'
import { A } from '@/lib/router'

/* ------------------------------------------------------------------ *
 * Plain text with links. Strings are never rendered as HTML: the text is
 * split on URLs and nostr: references and each piece becomes a text node
 * or an anchor whose href passed isSafeUrl. Nothing else is interpreted.
 * ------------------------------------------------------------------ */

const TOKEN = /(https?:\/\/[^\s<>"'()]+[^\s<>"'().,;:!?]|nostr:npub1[0-9a-z]+)/gi

export function Linkify({ text, className }: { text: string; className?: string }) {
  const parts = text.split(TOKEN)
  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part
        if (part.toLowerCase().startsWith('nostr:npub1')) {
          try {
            const decoded = nip19.decode(part.slice(6).toLowerCase())
            if (decoded.type === 'npub') {
              return (
                <A key={i} href={userPath(decoded.data)} className="text-accent-ink underline">
                  {part.slice(6, 6 + 12)}…
                </A>
              )
            }
          } catch {
            // not an npub after all; fall through to plain text
          }
          return part
        }
        if (!isSafeUrl(part)) return part
        return (
          <a key={i} href={part} className="text-accent-ink underline break-all" rel="noopener noreferrer nofollow ugc" target="_blank">
            {part}
          </a>
        )
      })}
    </span>
  )
}
