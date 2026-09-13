'use client'

import { useMemo, useState } from 'react'
import type { CuratedSchema } from '@/lib/protocol/curated'
import type { PostGroup } from '@/lib/protocol/group'
import { describeEntry, flairFields, hasImageField } from '@/lib/render/entry'
import { compareBy, SORTS, type SortKey } from '@/lib/rank/hot'
import { shownScore, VOTE_MODES } from '@/lib/rank/wot'
import type { ListSnapshot } from '@/lib/store/listStore'
import { getReactionStore, useReactions } from '@/lib/store/reactionStore'
import { preferences, usePreferences } from '@/lib/store/preferences'
import { useSession } from '@/lib/store/session'
import { useWeighting } from '@/lib/store/useWeighting'
import type { ListRef, ListTab } from '@/lib/routes'
import { useCommentCounts } from '@/lib/store/threadStore'
import { useListMutes } from '@/lib/store/useListMutes'
import { isMuted } from '@/lib/protocol/mutes'
import { EntryCard } from './EntryCard'

/**
 * The front page (curated groups) or the queue (every group, state shown):
 * ranked by the viewer's choice from the votes this page fetched, with a
 * flair filter. The count shown on each post is the one the viewer chose.
 */
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
  const prefs = usePreferences()
  const sort: SortKey = tab === 'new' ? 'new' : prefs.sort
  const session = useSession()
  const weighting = useWeighting(schema)

  const [showRejected, setShowRejected] = useState(false)
  const rejectedCount = useMemo(() => snapshot.groups.filter((g) => g.rejected).length, [snapshot.groups])
  // The curator's mute list bans inside the list — the queue and New — and the viewer's applies everywhere.
  const { merged, viewer: viewerMutes } = useListMutes(schema)
  const base = useMemo(
    () =>
      tab === 'front'
        ? snapshot.groups.filter((g) => g.state === 'curated' && !isMuted(viewerMutes, g.head))
        : snapshot.groups.filter((g) => (showRejected || !g.rejected) && !isMuted(merged, g.head)),
    [snapshot.groups, tab, showRejected, merged, viewerMutes],
  )
  const page = useMemo(() => base.slice(0, 120), [base])
  const countFor = useCommentCounts(schema, page, snapshot.relays)
  const targets = useMemo(
    () => ({ coordinates: page.flatMap((g) => g.coordinates), ids: page.flatMap((g) => g.ids) }),
    [page],
  )
  const tallyFor = useReactions(schema, snapshot.relays, targets, weighting)

  const ranked = useMemo(() => {
    const filtered = flair
      ? page.filter((g) => describeEntry(g.head, schema).flairs.some((f) => f.field === flair.field && f.value === flair.value))
      : page
    const withTallies = filtered.map((group) => {
      const tally = tallyFor([...group.coordinates, ...group.ids])
      return { group, tally, id: group.head.id, createdAt: group.head.created_at, score: shownScore(tally, weighting.mode), sats: tally.sats }
    })
    withTallies.sort(compareBy(sort))
    return withTallies
  }, [page, flair, schema, tallyFor, sort, weighting.mode])

  const options = useMemo(() => {
    const seen = new Map<string, { field: string; value: string; count: number }>()
    for (const group of base) {
      for (const f of describeEntry(group.head, schema).flairs) {
        const key = `${f.field}:${f.value}`
        const entry = seen.get(key) ?? { field: f.field, value: f.value, count: 0 }
        entry.count += 1
        seen.set(key, entry)
      }
    }
    return [...seen.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
  }, [base, schema])

  const chip = (active: boolean) =>
    `rounded-full border px-2.5 py-1 ${active ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-muted hover:text-ink'}`

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        {tab === 'front' ? (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sort">
            {SORTS.map((s) => (
              <button key={s.key} type="button" title={s.hint} onClick={() => preferences.set({ sort: s.key })} className={chip(sort === s.key)}>
                {s.label}
              </button>
            ))}
          </div>
        ) : null}
        {tab === 'new' && rejectedCount > 0 ? (
          <button type="button" onClick={() => setShowRejected((v) => !v)} className={chip(showRejected)}>
            {showRejected ? 'Hide' : 'Show'} {rejectedCount} rejected
          </button>
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Which votes count">
          <span className="text-muted">Count:</span>
          {VOTE_MODES.map((m) => (
            <button key={m.key} type="button" title={m.hint} onClick={() => preferences.set({ votes: m.key })} className={chip(prefs.votes === m.key)}>
              {m.label}
            </button>
          ))}
          <span className="text-muted" title="Whose follow list decides what trusted means.">
            trust from {weighting.trustedFrom} ({weighting.trustedCount})
          </span>
        </div>
      </div>

      {flairFields(schema).length > 0 && options.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 text-xs" role="group" aria-label="Flair">
          <button type="button" onClick={() => setFlair(null)} className={chip(flair === null)}>
            All
          </button>
          {options.map((o) => {
            const active = flair?.field === o.field && flair.value === o.value
            return (
              <button key={`${o.field}:${o.value}`} type="button" onClick={() => setFlair(active ? null : { field: o.field, value: o.value })} className={chip(active)}>
                {o.value} <span className="opacity-60">{o.count}</span>
              </button>
            )
          })}
        </div>
      ) : null}

      {ranked.length === 0 ? (
        <Empty tab={tab} loading={snapshot.loading} />
      ) : layout === 'card' ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {ranked.map(({ group, tally }) => (
            <EntryCard
              key={group.identifier}
              group={group}
              schema={schema}
              list={list}
              layout="card"
              showState={tab === 'new'}
              comments={countFor(group)}
              vote={{ tally, weighting, relays: snapshot.relays, writeRelays: session.writeRelays, onVoted: getReactionStore(schema, snapshot.relays).pushEvent }}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {ranked.map(({ group, tally }) => (
            <EntryCard
              key={group.identifier}
              group={group}
              schema={schema}
              list={list}
              layout="row"
              showState={tab === 'new'}
              comments={countFor(group)}
              vote={{ tally, weighting, relays: snapshot.relays, writeRelays: session.writeRelays, onVoted: getReactionStore(schema, snapshot.relays).pushEvent }}
            />
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
