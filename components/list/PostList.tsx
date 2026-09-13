'use client'

import { useMemo, useState } from 'react'
import type { CuratedSchema } from '@/lib/protocol/curated'
import type { PostGroup } from '@/lib/protocol/group'
import { describeEntry, flairFields, hasImageField } from '@/lib/render/entry'
import type { ListSnapshot } from '@/lib/store/listStore'
import type { ListRef, ListTab } from '@/lib/routes'
import { useCommentCounts } from '@/lib/store/threadStore'
import { EntryCard } from './EntryCard'

/** The front page (curated groups) or the queue (every group, state shown), with a flair filter. */
export function PostList({
  schema,
  snapshot,
  list,
  tab,
}: {
  schema: CuratedSchema
  snapshot: ListSnapshot
  list: ListRef
  tab: ListTab
}) {
  const [flair, setFlair] = useState<{ field: string; value: string } | null>(null)
  const layout = hasImageField(schema) ? 'card' : 'row'
  const countFor = useCommentCounts(schema, snapshot.groups.slice(0, 120), snapshot.relays)

  const groups = useMemo(() => {
    const visible = tab === 'front' ? snapshot.groups.filter((g) => g.state === 'curated') : snapshot.groups
    if (!flair) return visible
    return visible.filter((g) =>
      describeEntry(g.head, schema).flairs.some((f) => f.field === flair.field && f.value === flair.value),
    )
  }, [snapshot.groups, tab, flair, schema])

  const options = useMemo(() => {
    const seen = new Map<string, { field: string; value: string; count: number }>()
    const source = tab === 'front' ? snapshot.groups.filter((g) => g.state === 'curated') : snapshot.groups
    for (const group of source) {
      for (const f of describeEntry(group.head, schema).flairs) {
        const key = `${f.field}:${f.value}`
        const entry = seen.get(key) ?? { field: f.field, value: f.value, count: 0 }
        entry.count += 1
        seen.set(key, entry)
      }
    }
    return [...seen.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
  }, [snapshot.groups, tab, schema])

  return (
    <div className="space-y-4">
      {flairFields(schema).length > 0 && options.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setFlair(null)}
            className={`rounded-full border px-2.5 py-1 ${flair === null ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-muted hover:text-ink'}`}
          >
            All
          </button>
          {options.map((o) => {
            const active = flair?.field === o.field && flair.value === o.value
            return (
              <button
                key={`${o.field}:${o.value}`}
                type="button"
                onClick={() => setFlair(active ? null : { field: o.field, value: o.value })}
                className={`rounded-full border px-2.5 py-1 ${active ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-muted hover:text-ink'}`}
              >
                {o.value} <span className="opacity-60">{o.count}</span>
              </button>
            )
          })}
        </div>
      ) : null}

      {groups.length === 0 ? (
        <Empty tab={tab} loading={snapshot.loading} />
      ) : layout === 'card' ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {groups.map((g) => (
            <EntryCard key={g.identifier} group={g} schema={schema} list={list} layout="card" showState={tab === 'new'} comments={countFor(g)} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => (
            <EntryCard key={g.identifier} group={g} schema={schema} list={list} layout="row" showState={tab === 'new'} comments={countFor(g)} />
          ))}
        </div>
      )}
    </div>
  )
}

function Empty({ tab, loading }: { tab: ListTab; loading: boolean }) {
  if (loading) return <p className="py-12 text-center text-muted">Reading the relays…</p>
  return (
    <p className="py-12 text-center text-muted">
      {tab === 'front'
        ? 'Nothing on the front page yet — the curator has not signed anything. Try the New tab.'
        : 'Nothing has been suggested to this list yet.'}
    </p>
  )
}

export type { PostGroup }
