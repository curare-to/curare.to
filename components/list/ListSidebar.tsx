'use client'

import { nip19 } from 'nostr-tools'
import type { Event } from 'nostr-tools/pure'
import { formFields, type CuratedSchema } from '@/lib/protocol/curated'
import { useSession } from '@/lib/store/session'
import { withBase } from '@/lib/router'
import type { ListSnapshot } from '@/lib/store/listStore'
import { ProfileName } from '@/components/ui/ProfileName'
import { Linkify } from '@/components/ui/Linkify'

const VISIBILITY: Record<CuratedSchema['visibility'], string> = {
  public: 'Public — anyone may suggest.',
  closed: 'Closed — only the curator and listed pubkeys may suggest; anyone may read.',
  private: 'Private — only the curator and listed pubkeys may suggest or read.',
}

export function ListSidebar({ schema, event, snapshot }: { schema: CuratedSchema; event: Event; snapshot: ListSnapshot | null }) {
  const fields = formFields(schema)
  const session = useSession()
  const curator = session.pubkey === schema.namespace
  // The signed schema event as a file: what a site of its own serves at /.well-known/curare.to/nostr.json.
  const download = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(event))}`
  return (
    <aside className="space-y-5 text-sm">
      <section className="rounded-lg border border-line bg-surface p-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">About</h2>
        <p className="text-ink-2">
          <Linkify text={schema.description} />
        </p>
        {snapshot ? (
          <p className="mt-3 text-muted">
            <span className="font-medium text-ink">{snapshot.canonicals.length}</span> on the front page ·{' '}
            <span className="font-medium text-ink">{snapshot.suggestions.length}</span> suggested
            {snapshot.dropped > 0 ? (
              <span title="Events on the relays that did not satisfy this schema and were not shown."> · {snapshot.dropped} rejected</span>
            ) : null}
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border border-line bg-surface p-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Curator</h2>
        <ProfileName pubkey={schema.namespace} />
        <p className="mt-1 break-all font-mono text-xs text-muted">{nip19.npubEncode(schema.namespace)}</p>
        <p className="mt-2 text-muted">{VISIBILITY[schema.visibility]}</p>
        {schema.authors.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {schema.authors.map((pk) => (
              <li key={pk}>
                <ProfileName pubkey={pk} />
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="rounded-lg border border-line bg-surface p-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">A post needs</h2>
        <ul className="space-y-1">
          {fields.map((f) => (
            <li key={f.name} className="flex justify-between gap-2">
              <span className="text-ink">{f.label}</span>
              <span className="text-muted">
                {f.type}
                {f.required ? ' · required' : ''}
              </span>
            </li>
          ))}
        </ul>
        {schema.requireAny.length > 0 ? (
          <p className="mt-2 text-muted">
            {schema.requireAny.map((g) => `at least one of ${g.join(', ')}`).join('; ')}.
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border border-line bg-surface p-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Relays</h2>
        {schema.relays.length > 0 ? (
          <ul className="space-y-1 break-all font-mono text-xs text-ink-2">
            {schema.relays.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">
            This schema names no relay; read from {snapshot?.relays.join(', ') ?? 'the directory relays'}.
          </p>
        )}
        <p className="mt-2 break-all font-mono text-xs text-muted">
          31889:{schema.namespace.slice(0, 8)}…:{schema.identifier}
        </p>
      </section>

      <section className="rounded-lg border border-line bg-surface p-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">This list</h2>
        <ul className="space-y-1">
          {curator ? (
            <li>
              <a href={withBase(`/new/?edit=${encodeURIComponent(`31889:${schema.namespace}:${schema.identifier}`)}`)} className="text-accent-ink underline">
                Edit the schema
              </a>
            </li>
          ) : null}
          <li>
            <a href={download} download="nostr.json" className="text-accent-ink underline" title="The signed schema event, exactly as published — serve it at /.well-known/curare.to/nostr.json on your own domain.">
              Download for your own domain
            </a>
          </li>
        </ul>
        <p className="mt-2 text-xs text-muted">
          Any site that serves this file is a client of the same list — see the README&apos;s “your own site”.
        </p>
      </section>
    </aside>
  )
}
