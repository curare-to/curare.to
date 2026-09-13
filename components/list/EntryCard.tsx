'use client'

import type { CuratedSchema } from '@/lib/protocol/curated'
import type { PostGroup } from '@/lib/protocol/group'
import { describeEntry } from '@/lib/render/entry'
import { A } from '@/lib/router'
import { buildPath, type ListRef } from '@/lib/routes'
import { ProfileName } from '@/components/ui/ProfileName'
import { TimeAgo } from '@/components/ui/TimeAgo'
import { SafeImage } from '@/components/ui/SafeImage'

export function StateBadge({ group }: { group: PostGroup }) {
  return group.state === 'curated' ? (
    <span className="rounded bg-accent-soft px-1.5 py-0.5 text-xs font-medium text-accent-ink" title="Signed by the curator.">
      curated
    </span>
  ) : (
    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted" title="Suggested; not yet on the front page.">
      pending
    </span>
  )
}

export function FlairChips({ flairs }: { flairs: { field: string; value: string }[] }) {
  if (flairs.length === 0) return null
  return (
    <>
      {flairs.map((f) => (
        <span key={`${f.field}:${f.value}`} className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-xs text-ink-2">
          {f.value}
        </span>
      ))}
    </>
  )
}

export function EntryCard({
  group,
  schema,
  list,
  layout,
  showState,
}: {
  group: PostGroup
  schema: CuratedSchema
  list: ListRef
  layout: 'card' | 'row'
  showState: boolean
}) {
  const view = describeEntry(group.head, schema)
  const href = buildPath({ kind: 'entry', list, entry: group.identifier })
  const versions = group.suggestions.length

  const meta = (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
      {showState ? <StateBadge group={group} /> : null}
      <span>
        by <ProfileName pubkey={view.pubkey} />
      </span>
      <TimeAgo seconds={view.createdAt} />
      {versions > 1 ? <span title="Suggested by more than one person.">{versions} versions</span> : null}
      <FlairChips flairs={view.flairs} />
    </p>
  )

  if (layout === 'card') {
    return (
      <article className="group flex flex-col overflow-hidden rounded-lg border border-line bg-surface">
        <A href={href} className="block aspect-[3/4] bg-surface-2">
          <SafeImage src={view.image} className="h-full w-full object-cover" placeholderClassName="h-full w-full" />
        </A>
        <div className="flex flex-1 flex-col gap-2 p-3">
          <h3 className="font-medium leading-snug">
            <A href={href} className="text-ink no-underline hover:underline">
              {view.title}
            </A>
          </h3>
          {view.link ? (
            <a href={view.link.url} className="text-xs text-accent-ink hover:underline" rel="noopener noreferrer nofollow ugc" target="_blank">
              {view.link.host} ↗
            </a>
          ) : null}
          {meta}
        </div>
      </article>
    )
  }

  return (
    <article className="flex gap-3 rounded-lg border border-line bg-surface p-3">
      {view.image ? (
        <A href={href} className="block h-16 w-16 shrink-0 overflow-hidden rounded bg-surface-2">
          <SafeImage src={view.image} className="h-full w-full object-cover" placeholderClassName="h-full w-full" />
        </A>
      ) : null}
      <div className="min-w-0 flex-1 space-y-1">
        <h3 className="font-medium leading-snug">
          <A href={href} className="text-ink no-underline hover:underline">
            {view.title}
          </A>
          {view.link ? (
            <a
              href={view.link.url}
              className="ml-2 text-xs font-normal text-accent-ink hover:underline"
              rel="noopener noreferrer nofollow ugc"
              target="_blank"
            >
              ({view.link.host})
            </a>
          ) : null}
        </h3>
        {view.body ? <p className="line-clamp-2 text-sm text-ink-2">{view.body}</p> : null}
        {meta}
      </div>
    </article>
  )
}
