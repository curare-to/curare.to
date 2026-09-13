'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CuratedSchema } from '@/lib/protocol/curated'
import { parseCoordinate } from '@/lib/protocol/curated'
import { SORTS, type SortKey } from '@/lib/rank/hot'
import { otherWeightFor, weightFor } from '@/lib/rank/wot'
import { useFeed, type FeedItem } from '@/lib/store/feedStore'
import { useFollows } from '@/lib/store/followStore'
import { preferences, usePreferences } from '@/lib/store/preferences'
import { useSession } from '@/lib/store/session'
import { useSubscriptions } from '@/lib/store/subscriptionStore'
import { resolveSchemaCached } from '@/lib/resolve/schema'
import { listPath, listRefOf } from '@/lib/routes'
import { withBase } from '@/lib/router'
import { getReactionStore } from '@/lib/store/reactionStore'
import { EntryCard } from '@/components/list/EntryCard'
import { DirectoryRow, useVisibleDirectory } from '@/components/directory/DirectoryList'
import { OpenList } from './OpenList'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

/**
 * The front door. Signed in with subscriptions: one feed, the union of the
 * subscribed subs' front pages, ranked. Otherwise: the directory, and the
 * hottest posts across the twenty most recently revised subs on it.
 */
export function Home() {
  const session = useSession()
  const subs = useSubscriptions()
  const subscribed = session.status === 'signed-in' && subs.status === 'ready' && subs.subscriptions.length > 0
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {subscribed ? <SubscribedHome /> : <OpenHome />}
    </div>
  )
}

/** Resolve a set of coordinates to schemas, once each; unresolvable ones are dropped. */
function useResolvedSchemas(coordinates: string[]): { schemas: CuratedSchema[]; pending: boolean } {
  const [resolved, setResolved] = useState<Map<string, CuratedSchema>>(new Map())
  const key = coordinates.join('\n')
  useEffect(() => {
    let cancelled = false
    void Promise.all(
      coordinates.map(async (coordinate) => {
        const c = parseCoordinate(coordinate)
        if (!c) return null
        const result = await resolveSchemaCached({ by: 'coordinate', curator: { type: 'pubkey', pubkey: c.pubkey }, identifier: c.identifier })
        return result.status === 'ready' ? ([coordinate, result.schema] as const) : null
      }),
    ).then((pairs) => {
      if (!cancelled) setResolved(new Map(pairs.filter((p): p is readonly [string, CuratedSchema] => p !== null)))
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const schemas = useMemo(() => coordinates.map((c) => resolved.get(c)).filter((s): s is CuratedSchema => !!s), [coordinates, resolved])
  return { schemas, pending: coordinates.length > 0 && resolved.size === 0 }
}

function useFeedOptions(sort: SortKey) {
  const session = useSession()
  const prefs = usePreferences()
  const follows = useFollows(session.pubkey)
  return useMemo(
    () => ({ weight: weightFor(follows, session.pubkey, otherWeightFor(prefs.votes)), viewer: session.pubkey, mode: prefs.votes, sort }),
    [follows, session.pubkey, prefs.votes, sort],
  )
}

function SubscribedHome() {
  const subs = useSubscriptions()
  const coordinates = useMemo(() => subs.subscriptions.map((s) => s.coordinate), [subs.subscriptions])
  const { schemas, pending } = useResolvedSchemas(coordinates)
  const prefs = usePreferences()
  const options = useFeedOptions(prefs.sort)
  const feed = useFeed('home', schemas, options)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-xl font-semibold tracking-tight">Your front page</h1>
        <SortChips sort={prefs.sort} />
        <span className="text-xs text-muted">
          {schemas.length} of {coordinates.length} subscribed lists ·{' '}
          <a href={`${BASE}/all/`} className="underline">
            all lists
          </a>
        </span>
      </div>
      <Feed items={feed.items} loading={feed.loading || pending} empty="Nothing on your lists' front pages yet." />
      {subs.privateUnreadable ? <p className="text-xs text-note">Some of your subscriptions are private and this extension cannot open them.</p> : null}
    </div>
  )
}

function OpenHome() {
  const { entries, loading } = useVisibleDirectory(20)
  const schemas = useMemo(() => entries.map((e) => e.schema), [entries])
  const prefs = usePreferences()
  const options = useFeedOptions(prefs.sort)
  const feed = useFeed('open', schemas, options)
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-xl font-semibold tracking-tight">Across the newest lists</h1>
          <SortChips sort={prefs.sort} />
        </div>
        <p className="text-sm text-muted">
          The front pages of the twenty most recently revised lists on the directory relays. Subscribe to some and this becomes your page.
        </p>
        <Feed items={feed.items} loading={feed.loading || loading} empty="Nothing curated on those lists yet." />
      </div>
      <aside className="space-y-4">
        <div className="rounded-lg border border-line bg-surface p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Open a list</h2>
          <div className="mt-2">
            <OpenList />
          </div>
          <p className="mt-2 text-xs text-muted">
            A domain (bitcoin.mov), or an npub and an identifier. Or{' '}
            <a href={`${BASE}/new/`} className="underline">
              start one
            </a>
            .
          </p>
        </div>
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Newest lists ·{' '}
            <a href={`${BASE}/all/`} className="underline">
              all
            </a>
          </h2>
          <ul className="space-y-2">
            {entries.slice(0, 8).map((e) => (
              <DirectoryRow key={e.coordinate} entry={e} />
            ))}
          </ul>
        </div>
      </aside>
    </div>
  )
}

function SortChips({ sort }: { sort: SortKey }) {
  return (
    <div className="flex flex-wrap gap-1.5 text-xs" role="group" aria-label="Sort">
      {SORTS.map((s) => (
        <button
          key={s.key}
          type="button"
          title={s.hint}
          onClick={() => preferences.set({ sort: s.key })}
          className={`rounded-full border px-2.5 py-1 ${sort === s.key ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-muted hover:text-ink'}`}
        >
          {s.label}
        </button>
      ))}
    </div>
  )
}

function Feed({ items, loading, empty }: { items: FeedItem[]; loading: boolean; empty: string }) {
  const session = useSession()
  const prefs = usePreferences()
  const follows = useFollows(session.pubkey)
  if (items.length === 0) return <p className="py-12 text-center text-muted">{loading ? 'Reading the relays…' : empty}</p>
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={`${item.schema.namespace}:${item.schema.identifier}:${item.group.identifier}`}>
          <p className="mb-1 text-xs text-muted">
            in{' '}
            <a href={withBase(listPath(item.schema))} className="text-ink-2 hover:underline">
              {item.schema.domain ?? item.schema.name}
            </a>
          </p>
          <EntryCard
            group={item.group}
            schema={item.schema}
            list={listRefOf(item.schema)}
            layout="row"
            showState={false}
            vote={{
              tally: item.tally,
              weighting: {
                weight: weightFor(follows, session.pubkey, otherWeightFor(prefs.votes)),
                viewer: session.pubkey,
                mode: prefs.votes,
                trustedFrom: session.pubkey ? 'you' : 'the curator',
                trustedCount: follows.size,
              },
              relays: item.relays,
              writeRelays: session.writeRelays,
              onVoted: getReactionStore(item.schema, item.relays).pushEvent,
            }}
          />
        </div>
      ))}
    </div>
  )
}
