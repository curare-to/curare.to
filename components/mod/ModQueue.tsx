'use client'

import { useMemo, useState } from 'react'
import type { Event } from 'nostr-tools/pure'
import { canCurate, type CuratedSchema } from '@/lib/protocol/curated'
import type { PostGroup } from '@/lib/protocol/group'
import { buildDeletionTemplate, buildRejectionTemplate } from '@/lib/protocol/labels'
import { approveTemplate, diffEntries } from '@/lib/entry/curate'
import { describeEntry } from '@/lib/render/entry'
import { Nip07Error, signAndPublish } from '@/lib/nostr/nip07'
import { getListStore, type ListSnapshot } from '@/lib/store/listStore'
import { useSession } from '@/lib/store/session'
import { A } from '@/lib/router'
import { buildPath, type ListRef } from '@/lib/routes'
import { ProfileName } from '@/components/ui/ProfileName'
import { TimeAgo } from '@/components/ui/TimeAgo'
import { EntryForm } from '@/components/entry/EntryForm'
import { suggestHref } from '@/components/list/ListHeader'
import { useListMutes } from '@/lib/store/useListMutes'
import { isMuted } from '@/lib/protocol/mutes'
import { useReports } from '@/lib/store/reportStore'
import type { Report } from '@/lib/protocol/reports'

export const CURARE_APP_URL = 'https://github.com/curare-to/curated-kmp'

/**
 * The curator's queue: what `npm run curate` does, on the page. Approve
 * signs the head suggestion's values as a canonical entry naming its
 * source; edit-then-approve corrects them on the way through; reject
 * publishes a NIP-32 label the queue hides by. A group edited after it was
 * curated is flagged with a diff. Anyone signed in may look; only the
 * schema's key may act — a team's key is in the Curare app.
 */
export function ModQueue({ schema, snapshot, list }: { schema: CuratedSchema; snapshot: ListSnapshot; list: ListRef }) {
  const session = useSession()
  const curator = !!session.pubkey && canCurate(schema, session.pubkey)
  const [showRejected, setShowRejected] = useState(false)

  const { curator: curatorMutes } = useListMutes(schema)
  const pending = useMemo(() => snapshot.groups.filter((g) => g.state === 'pending' && !g.rejected && !isMuted(curatorMutes, g.head)), [snapshot.groups, curatorMutes])
  const muted = useMemo(() => snapshot.groups.filter((g) => g.state === 'pending' && !g.rejected && isMuted(curatorMutes, g.head)), [snapshot.groups, curatorMutes])
  const [showMuted, setShowMuted] = useState(false)
  const rejected = useMemo(() => snapshot.groups.filter((g) => g.rejected), [snapshot.groups])
  const reportsFor = useReports(schema, snapshot.relays, useMemo(() => snapshot.groups.flatMap((g) => g.ids), [snapshot.groups]))
  const updated = useMemo(
    () => snapshot.groups.filter((g) => g.canonical && g.suggestions.some((s) => s.created_at > g.canonical!.created_at)),
    [snapshot.groups],
  )

  return (
    <div className="space-y-8">
      {!curator ? (
        <div className="rounded-lg border border-note bg-note-soft p-4 text-sm text-ink">
          <p className="font-medium">This list is curated by a key that is not in your extension.</p>
          <p className="mt-1 text-ink-2">
            The queue below is read-only for you. Teams curate in the Curare app, where a group&apos;s threshold key
            signs —{' '}
            <a href={CURARE_APP_URL} className="underline" rel="noopener noreferrer" target="_blank">
              download it
            </a>
            . If this is your list, sign in with the key that published its schema.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted">
            Signed in as the curator. Approving signs a kind 31890 in your extension and sends it to {schema.relays.length > 0 ? schema.relays.join(', ') : 'the directory relays'}.
          </span>
          <a href={`${suggestHref(list, schema)}&as=canonical`} className="rounded-md border border-line px-3 py-1.5 text-ink no-underline hover:border-line-strong">
            Add an entry directly
          </a>
        </div>
      )}

      <Section title={`Pending (${pending.length})`} empty={snapshot.loading ? 'Reading the relays…' : 'Nothing is waiting.'}>
        {pending.map((g) => (
          <QueueRow key={g.identifier} group={g} schema={schema} snapshot={snapshot} list={list} curator={curator} reports={curator ? reportsFor(g.ids) : []} />
        ))}
      </Section>

      {muted.length > 0 ? (
        <section>
          <button type="button" onClick={() => setShowMuted((v) => !v)} className="text-sm text-muted hover:text-ink">
            {showMuted ? '▾' : '▸'} From banned keys or muted words ({muted.length})
          </button>
          {showMuted ? (
            <div className="mt-3 space-y-3">
              {muted.map((g) => (
                <QueueRow key={g.identifier} group={g} schema={schema} snapshot={snapshot} list={list} curator={curator} reports={curator ? reportsFor(g.ids) : []} />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {updated.length > 0 ? (
        <Section title={`Updated since curated (${updated.length})`} empty="">
          {updated.map((g) => (
            <QueueRow key={g.identifier} group={g} schema={schema} snapshot={snapshot} list={list} curator={curator} recuration reports={curator ? reportsFor(g.ids) : []} />
          ))}
        </Section>
      ) : null}

      {rejected.length > 0 ? (
        <section>
          <button type="button" onClick={() => setShowRejected((v) => !v)} className="text-sm text-muted hover:text-ink">
            {showRejected ? '▾' : '▸'} Rejected ({rejected.length})
          </button>
          {showRejected ? (
            <div className="mt-3 space-y-3">
              {rejected.map((g) => (
                <QueueRow key={g.identifier} group={g} schema={schema} snapshot={snapshot} list={list} curator={curator} reports={curator ? reportsFor(g.ids) : []} />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {children.length > 0 ? children : <p className="text-sm text-muted">{empty}</p>}
    </section>
  )
}

function QueueRow({
  group,
  schema,
  snapshot,
  list,
  curator,
  recuration,
  reports = [],
}: {
  group: PostGroup
  schema: CuratedSchema
  snapshot: ListSnapshot
  list: ListRef
  curator: boolean
  recuration?: boolean
  reports?: Report[]
}) {
  const session = useSession()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')

  // What approve would sign: the newest suggestion — for a re-curation, the one newer than the canonical entry.
  const head = recuration ? group.suggestions[0] : group.head
  const view = describeEntry(head, schema)
  const relays = [...new Set([...snapshot.relays, ...session.writeRelays])]
  const store = getListStore(schema)
  const changes = recuration && group.canonical ? diffEntries(schema, group.canonical, head) : []

  async function run(label: string, build: () => Promise<Event>) {
    setError(null)
    setBusy(label)
    try {
      const signed = await build()
      store.pushEvent(signed)
    } catch (err) {
      setError(err instanceof Nip07Error ? err.message : err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(null)
    }
  }

  const approve = () =>
    run('approve', async () => {
      // A re-curation replaces the canonical entry: stamp it later than the one it replaces.
      const now = Math.max(Math.floor(Date.now() / 1000), (group.canonical?.created_at ?? 0) + 1)
      const prepared = approveTemplate(schema, head, session.pubkey, now)
      if (!prepared.template) throw new Error(Object.values(prepared.errors).join(' '))
      return (await signAndPublish(prepared.template, relays)).signed
    })

  const reject = () =>
    run('reject', async () => {
      const template = buildRejectionTemplate({ suggestion: head, reason, relay: snapshot.relays[0] })
      if (!template) throw new Error('This suggestion has no identifier.')
      const { signed } = await signAndPublish(template, relays)
      setRejecting(false)
      setReason('')
      return signed
    })

  const unreject = () =>
    run('unreject', async () => {
      const labels = group.rejections.map((r) => ({ id: r.id, kind: 1985 }))
      return (await signAndPublish(buildDeletionTemplate(labels, 'reconsidered'), relays)).signed
    })

  const href = buildPath({ kind: 'entry', list, entry: group.identifier })
  return (
    <article className="rounded-lg border border-line bg-surface p-4 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-medium">
          <A href={href} className="text-ink no-underline hover:underline">
            {view.title}
          </A>
        </h3>
        {view.link ? (
          <a href={view.link.url} className="text-xs text-accent-ink hover:underline" rel="noopener noreferrer nofollow ugc" target="_blank">
            {view.link.host} ↗
          </a>
        ) : null}
        <span className="text-xs text-muted">
          by <ProfileName pubkey={head.pubkey} className="text-xs" /> <TimeAgo seconds={head.created_at} />
          {group.suggestions.length > 1 ? ` · ${group.suggestions.length} versions` : ''}
        </span>
      </div>
      {view.body ? <p className="mt-1 line-clamp-2 text-ink-2">{view.body}</p> : null}

      {group.rejections.length > 0 ? (
        <p className="mt-2 text-xs text-note">
          Rejected {group.rejections[0].reason ? `— “${group.rejections[0].reason}”` : ''}
        </p>
      ) : null}

      {reports.length > 0 ? (
        <div className="mt-2 rounded-md border border-danger bg-danger-soft px-3 py-2 text-xs text-ink">
          <p className="font-medium">
            {reports.length} report{reports.length === 1 ? '' : 's'}
          </p>
          <ul className="mt-1 space-y-0.5">
            {reports.slice(0, 5).map((r) => (
              <li key={r.id}>
                <span className="font-medium">{r.type}</span>
                {r.reason ? ` — ${r.reason}` : ''} <span className="text-muted">by <ProfileName pubkey={r.pubkey} className="text-xs" /></span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {changes.length > 0 ? (
        <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
          {changes.map((c) => (
            <div key={c.field} className="contents">
              <dt className="text-muted">{c.label}</dt>
              <dd>
                <span className="text-danger line-through">{c.before || '—'}</span> <span className="text-accent-ink">{c.after || '—'}</span>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {curator ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!editing && !rejecting ? (
            <>
              <button type="button" onClick={approve} disabled={busy !== null} className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-ink disabled:opacity-50">
                {busy === 'approve' ? 'Signing…' : recuration ? 'Approve the update' : 'Approve'}
              </button>
              <button type="button" onClick={() => setEditing(true)} disabled={busy !== null} className="rounded-md border border-line px-3 py-1.5 hover:border-line-strong disabled:opacity-50">
                Edit, then approve
              </button>
              {group.rejected ? (
                <button type="button" onClick={unreject} disabled={busy !== null} className="rounded-md border border-line px-3 py-1.5 hover:border-line-strong disabled:opacity-50">
                  {busy === 'unreject' ? 'Signing…' : 'Withdraw the rejection'}
                </button>
              ) : !recuration ? (
                <button type="button" onClick={() => setRejecting(true)} disabled={busy !== null} className="rounded-md border border-line px-3 py-1.5 text-danger hover:border-line-strong disabled:opacity-50">
                  Reject
                </button>
              ) : null}
            </>
          ) : null}
          {rejecting ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void reject()
              }}
              className="flex w-full flex-wrap items-center gap-2"
            >
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why, in a sentence (optional)"
                aria-label="Reason"
                className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
              />
              <button type="submit" disabled={busy !== null} className="rounded-md bg-danger px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                {busy === 'reject' ? 'Signing…' : 'Reject'}
              </button>
              <button type="button" onClick={() => setRejecting(false)} className="text-muted hover:text-ink">
                Cancel
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {editing ? (
        <div className="mt-4 border-t border-line pt-4">
          <EntryForm
            schema={schema}
            mode="canonical"
            source={head}
            groups={snapshot.groups}
            onPublished={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
    </article>
  )
}
