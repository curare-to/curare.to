'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { isValidDomain, normalizeDomain, parseCoordinate, CURATED_SCHEMA_KIND, type CuratedSchema } from '@/lib/protocol/curated'
import { useResolvedSchema } from '@/lib/store/useResolvedSchema'
import { useList } from '@/lib/store/listStore'
import { useSession } from '@/lib/store/session'
import { withBase } from '@/lib/router'
import { buildPath, type ListRef } from '@/lib/routes'
import { listDisplayName } from '@/components/list/ListHeader'
import { Notice } from '@/components/list/ListPage'
import { EntryForm, type Published } from './EntryForm'

/** `?to=` names the list: a coordinate (31889:<pubkey>:<d>) or a domain. */
export function listRefFromParam(to: string | null): ListRef | null {
  if (!to) return null
  const coordinate = parseCoordinate(to)
  if (coordinate && coordinate.kind === CURATED_SCHEMA_KIND) {
    return { by: 'coordinate', curator: { type: 'pubkey', pubkey: coordinate.pubkey }, identifier: coordinate.identifier }
  }
  const domain = normalizeDomain(to)
  if (isValidDomain(domain)) return { by: 'domain', domain }
  return null
}

/** /submit/?to=<list>[&edit=<d>]: the form, outside any sub, so "post to…" can be linked from anywhere. */
export function SubmitPage() {
  const params = useSearchParams()
  const to = params.get('to')
  const edit = params.get('edit')
  const canonical = params.get('as') === 'canonical'
  const list = useMemo(() => listRefFromParam(to), [to])

  if (!list) {
    return (
      <Notice
        title="Which list?"
        body="Open a list and use its Suggest button, or link here with ?to=31889:<pubkey>:<identifier> or ?to=<domain>."
      />
    )
  }
  return <ResolvedSubmit list={list} edit={edit} canonical={canonical} />
}

function ResolvedSubmit({ list, edit, canonical }: { list: ListRef; edit: string | null; canonical: boolean }) {
  const resolved = useResolvedSchema(list)
  if (resolved.status === 'loading') return <Notice title="Looking up the list…" body="Fetching and verifying its schema." />
  if (resolved.status === 'unavailable') return <Notice title="Not a list" body={resolved.reason} />
  return <Form schema={resolved.schema} list={list} edit={edit} canonical={canonical} />
}

function Form({ schema, list, edit, canonical }: { schema: CuratedSchema; list: ListRef; edit: string | null; canonical: boolean }) {
  const snapshot = useList(schema)
  const session = useSession()
  const [published, setPublished] = useState<Published | null>(null)

  useEffect(() => {
    document.title = `${canonical ? 'Add' : edit ? 'Edit' : 'Suggest'} · ${listDisplayName(schema, list)} · curare.to`
  }, [schema, list, edit, canonical])

  // Editing: the viewer's own version of that d, once the store has it.
  const editing = useMemo(() => {
    if (!edit || !session.pubkey) return null
    const group = snapshot.groups.find((g) => g.identifier === edit)
    return group?.suggestions.find((s) => s.pubkey === session.pubkey) ?? null
  }, [edit, session.pubkey, snapshot.groups])

  if (edit && !editing) {
    return (
      <Notice
        title={snapshot.loading || session.status === 'checking' ? 'Looking for your entry…' : 'Nothing of yours to edit'}
        body={
          snapshot.loading || session.status === 'checking'
            ? 'Reading the relays.'
            : session.pubkey
              ? `No suggestion with the identifier "${edit}" by your key is on this list.`
              : 'Sign in with the key that published it.'
        }
      />
    )
  }

  if (published) {
    const href = withBase(buildPath({ kind: 'entry', list, entry: published.identifier }))
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-semibold">Published</h1>
        <p className="mt-2 text-ink-2">
          {published.accepted} of {published.total} relays accepted it.{' '}
          {canonical
            ? 'It is on the front page: a canonical entry, signed by you.'
            : `It is in the list's queue now — the curator decides whether it reaches the front page.`}
        </p>
        <a href={href} className="mt-4 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-ink">
          See it
        </a>
      </div>
    )
  }

  const back = withBase(buildPath({ kind: 'list', list, tab: 'front' }))
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <p className="text-sm">
        <a href={back} className="text-muted hover:text-ink">
          ← {listDisplayName(schema, list)}
        </a>
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        {canonical ? `Add an entry to ${listDisplayName(schema, list)}` : editing ? 'Edit your suggestion' : `Suggest to ${listDisplayName(schema, list)}`}
      </h1>
      <p className="mb-6 mt-1 text-sm text-muted">
        {canonical
          ? 'A canonical entry nobody suggested, signed by the curator: it goes straight to the front page.'
          : editing
            ? 'Republished under the same identifier, this replaces your earlier version. If the curator had already curated it, the front page keeps their version until they curate again.'
            : schema.description}
      </p>
      <EntryForm
        key={editing?.id ?? (canonical ? 'canonical' : 'new')}
        schema={schema}
        editing={editing}
        mode={canonical ? 'canonical' : 'suggest'}
        groups={snapshot.groups}
        onPublished={setPublished}
      />
    </div>
  )
}
