'use client'

import { useMemo, useState } from 'react'
import { nip19 } from 'nostr-tools'
import { canSuggest } from '@/lib/protocol/curated'
import { hiddenStore, useDirectory, useHidden, type DirectoryEntry } from '@/lib/store/directoryStore'
import { useMutes } from '@/lib/store/muteStore'
import { useSession } from '@/lib/store/session'
import { listPath } from '@/lib/routes'
import { withBase } from '@/lib/router'
import { ProfileName } from '@/components/ui/ProfileName'
import { SafeImage } from '@/components/ui/SafeImage'
import { TimeAgo } from '@/components/ui/TimeAgo'

/** What the directory shows: verified, newest per coordinate, not private to others, not muted, not hidden. */
export function useVisibleDirectory(limit?: number): { entries: DirectoryEntry[]; hiddenCount: number; loading: boolean; exhausted: boolean; loadMore: () => Promise<void>; dropped: number } {
  const directory = useDirectory()
  const hidden = useHidden()
  const session = useSession()
  const mutes = useMutes(session.pubkey)
  const entries = useMemo(
    () =>
      directory.entries.filter(
        (e) =>
          (e.schema.visibility !== 'private' || canSuggest(e.schema, session.pubkey)) &&
          !mutes.pubkeys.has(e.schema.namespace) &&
          !hidden.has(e.coordinate),
      ),
    [directory.entries, hidden, mutes.pubkeys, session.pubkey],
  )
  return {
    entries: limit ? entries.slice(0, limit) : entries,
    hiddenCount: directory.entries.length - entries.length,
    loading: directory.loading,
    exhausted: directory.exhausted,
    loadMore: async () => {
      const { directoryStore } = await import('@/lib/store/directoryStore')
      await directoryStore.loadMore()
    },
    dropped: directory.dropped,
  }
}

/** /all/: every schema the directory relays hold, verified and unjudged. */
export function DirectoryList() {
  const { entries, hiddenCount, loading, exhausted, loadMore, dropped } = useVisibleDirectory()
  const [filter, setFilter] = useState('')
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((e) => `${e.schema.name} ${e.schema.description} ${e.schema.domain ?? ''}`.toLowerCase().includes(q))
  }, [entries, filter])

  return (
    <div className="space-y-4">
      <p className="rounded-md border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
        Everything the directory relays hold: each schema signature-checked and verified, the newest per coordinate,
        shown under its curator&apos;s name — and not judged. Hide what you like; your mute list applies here too.
        {dropped > 0 ? ` ${dropped} unusable schema${dropped === 1 ? '' : 's'} dropped.` : ''}
        {hiddenCount > 0 ? ` ${hiddenCount} hidden or private.` : ''}
      </p>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by name or description"
        aria-label="Filter"
        className="w-full max-w-md rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
      />
      {shown.length === 0 ? (
        <p className="py-12 text-center text-muted">{loading ? 'Reading the relays…' : filter ? 'Nothing matches.' : 'No lists on the directory relays yet.'}</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((e) => (
            <DirectoryRow key={e.coordinate} entry={e} />
          ))}
        </ul>
      )}
      {!exhausted ? (
        <button type="button" onClick={() => void loadMore()} disabled={loading} className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-line-strong disabled:opacity-50">
          {loading ? 'Loading…' : 'Older lists'}
        </button>
      ) : null}
    </div>
  )
}

export function DirectoryRow({ entry }: { entry: DirectoryEntry }) {
  const { schema, event, coordinate } = entry
  const href = withBase(listPath(schema))
  return (
    <li className="flex gap-3 rounded-lg border border-line bg-surface p-3 text-sm">
      <a href={href} className="block h-12 w-12 shrink-0 overflow-hidden rounded-md bg-surface-2">
        <SafeImage src={schema.profileImageUrl} className="h-full w-full object-cover" placeholderClassName="h-full w-full" />
      </a>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <a href={href} className="font-medium text-ink no-underline hover:underline">
            {schema.name}
          </a>
          {schema.domain ? (
            <span className="text-xs text-muted" title="A domain the schema claims; open it by domain to check.">
              {schema.domain} (claimed)
            </span>
          ) : null}
          {schema.visibility !== 'public' ? <span className="text-xs text-note">{schema.visibility}</span> : null}
        </div>
        <p className="line-clamp-2 text-ink-2">{schema.description}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
          <span>
            curated by <ProfileName pubkey={schema.namespace} className="text-xs" />
          </span>
          <span title={nip19.npubEncode(schema.namespace)}>revised <TimeAgo seconds={event.created_at} /></span>
          <span>{schema.fields.length} fields</span>
          <button type="button" onClick={() => hiddenStore.toggle(coordinate)} className="text-muted hover:text-ink" title="Hide this list here, on this device.">
            hide
          </button>
        </p>
      </div>
    </li>
  )
}
