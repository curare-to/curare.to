import { linkifyParts } from '@/lib/render/linkify'
import { A } from '@/lib/router'

/* ------------------------------------------------------------------ *
 * Plain text with links. Strings are never rendered as HTML: the text is
 * split by linkifyParts into text, safe urls and references to pages here,
 * and each piece becomes a text node or an anchor. Nothing else is
 * interpreted.
 * ------------------------------------------------------------------ */

export function Linkify({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className}>
      {linkifyParts(text).map((part, i) => {
        switch (part.kind) {
          case 'text':
            return part.text
          case 'ref':
            return (
              <A key={i} href={part.href} className="text-accent-ink underline">
                {part.label}
              </A>
            )
          case 'url':
            return (
              <a key={i} href={part.url} className="text-accent-ink underline break-all" rel="noopener noreferrer nofollow ugc" target="_blank">
                {part.url}
              </a>
            )
        }
      })}
    </span>
  )
}
