'use client'

import type { Event } from 'nostr-tools/pure'
import type { CuratedSchema } from '@/lib/protocol/curated'
import type { PostGroup } from '@/lib/protocol/group'
import { describeEntry } from '@/lib/render/entry'
import type { ListSnapshot } from '@/lib/store/listStore'
import { A } from '@/lib/router'
import { buildPath, type ListRef } from '@/lib/routes'
import { Linkify } from '@/components/ui/Linkify'
import { ProfileName } from '@/components/ui/ProfileName'
import { TimeAgo } from '@/components/ui/TimeAgo'
import { SafeImage } from '@/components/ui/SafeImage'
import { FlairChips, StateBadge } from './EntryCard'
import { suggestHref } from './ListHeader'
import { useSession } from '@/lib/store/session'

/** One post: the group's head in full, the other versions folded beneath. */
export function EntryPage({
  schema,
  snapshot,
  list,
  entry,
}: {
  schema: CuratedSchema
  snapshot: ListSnapshot
  list: ListRef
  entry: string
}) {
  const session = useSession()
  const group = snapshot.groups.find((g) => g.identifier === entry)
  if (!group) {
    return (
      <div className="py-12 text-center text-muted">
        {snapshot.loading ? 'Reading the relays…' : 'No post with that identifier is on this list.'}
      </div>
    )
  }
  const view = describeEntry(group.head, schema)
  const others = group.suggestions.filter((s) => s.id !== group.head.id)
  const mine = session.pubkey ? group.suggestions.find((s) => s.pubkey === session.pubkey) : null

  return (
    <article className="space-y-6">
      <div className="text-sm">
        <A href={buildPath({ kind: 'list', list, tab: 'front' })} className="text-muted hover:text-ink">
          ← back to the list
        </A>
      </div>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StateBadge group={group} />
          <FlairChips flairs={view.flairs} />
        </div>
        <h1 className="text-2xl font-semibold leading-tight tracking-tight">{view.title}</h1>
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
          <span>
            {group.state === 'curated' ? 'curated by' : 'suggested by'} <ProfileName pubkey={view.pubkey} />
          </span>
          <TimeAgo seconds={view.createdAt} />
          {mine ? (
            <a href={suggestHref(list, schema, group.identifier)} className="text-accent-ink underline">
              Edit your {group.canonical ? 'suggestion' : 'entry'}
            </a>
          ) : null}
        </p>
        {mine && group.canonical && mine.created_at > group.canonical.created_at ? (
          <p className="text-xs text-muted">
            You edited this after the curator curated it; the front page keeps their version until they curate again.
          </p>
        ) : null}
      </header>

      {view.image ? (
        <SafeImage
          src={view.image}
          className="max-h-[28rem] rounded-lg border border-line object-contain"
          placeholderClassName="h-40 w-32 rounded-lg border border-line bg-surface-2"
        />
      ) : null}

      {view.links.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {view.links.map((l) => (
            <li key={l.url}>
              <a
                href={l.url}
                className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-accent-ink hover:border-line-strong"
                rel="noopener noreferrer nofollow ugc"
                target="_blank"
              >
                {l.label} <span className="text-muted">· {l.host} ↗</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {view.body ? (
        <p className="max-w-prose whitespace-pre-wrap leading-relaxed text-ink">
          <Linkify text={view.body} />
        </p>
      ) : null}

      {view.details.length > 0 ? (
        <dl className="grid max-w-prose grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
          {view.details.map((d, i) => (
            <div key={`${d.field}:${i}`} className="contents">
              <dt className="text-muted">{d.label}</dt>
              <dd className="break-words text-ink">{d.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {view.hashtags.length > 0 ? (
        <p className="flex flex-wrap gap-1.5 text-xs text-muted">
          {view.hashtags.map((t) => (
            <span key={t}>#{t}</span>
          ))}
        </p>
      ) : null}

      {group.canonical && group.suggestions.length > 0 ? (
        <Versions title="Suggested by" schema={schema} events={group.suggestions} />
      ) : others.length > 0 ? (
        <Versions title="Also suggested by" schema={schema} events={others} />
      ) : null}
    </article>
  )
}

function Versions({ title, schema, events }: { title: string; schema: CuratedSchema; events: Event[] }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4 text-sm">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
      <ul className="space-y-2">
        {events.map((e) => {
          const v = describeEntry(e, schema)
          return (
            <li key={e.id} className="flex flex-wrap items-center gap-x-2 text-muted">
              <ProfileName pubkey={e.pubkey} />
              <TimeAgo seconds={e.created_at} />
              <span className="text-ink-2">{v.title}</span>
              {v.link ? <span>({v.link.host})</span> : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export type { PostGroup }
