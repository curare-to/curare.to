'use client'

import { useEffect } from 'react'
import type { CuratedSchema } from '@/lib/protocol/curated'
import { useList } from '@/lib/store/listStore'
import { profileStore } from '@/lib/store/profileStore'
import { useResolvedSchema } from '@/lib/store/useResolvedSchema'
import type { ListRef, ListTab } from '@/lib/routes'
import { ListHeader, listDisplayName } from './ListHeader'
import { ListSidebar } from './ListSidebar'
import { PostList } from './PostList'
import { EntryPage } from './EntryPage'

/**
 * /r/<…>/ and /r/<…>/<entry>/: resolve the address to a verified schema,
 * then read the list from the relays it names. A `private` list is shown to
 * nobody who cannot prove they belong — with no sign-in yet, that is nobody
 * (Phase 2 adds the viewer's key).
 */
export function ListPage({ list, tab, entry }: { list: ListRef; tab: ListTab; entry?: string }) {
  const resolved = useResolvedSchema(list)

  if (resolved.status === 'loading') {
    return <Notice title="Looking up the list…" body="Fetching and verifying its schema." />
  }
  if (resolved.status === 'unavailable') {
    return (
      <Notice
        title="Not a list"
        body={`${describeRef(list)} ${resolved.reason}.`}
        hint="The schema has to be a signed kind 31889 event that this address commits to; nothing is read without one."
      />
    )
  }
  return <ResolvedList schema={resolved.schema} list={list} tab={tab} entry={entry} />
}

function ResolvedList({ schema, list, tab, entry }: { schema: CuratedSchema; list: ListRef; tab: ListTab; entry?: string }) {
  const domainVerified = list.by === 'domain'
  useEffect(() => {
    document.title = `${listDisplayName(schema, list)} · curare.to`
    profileStore.addRelays(schema.relays)
  }, [schema, list])

  if (schema.visibility === 'private') {
    return (
      <>
        <ListHeader schema={schema} list={list} tab={null} domainVerified={domainVerified} />
        <Notice
          title="This list is private"
          body="Its curator asked clients to show it only to the pubkeys it names. Relays are open, so this is a convention, not encryption — and one this site honours."
          hint="Sign in with a listed key to read it (coming in Phase 2)."
        />
      </>
    )
  }
  return <LiveList schema={schema} list={list} tab={tab} entry={entry} domainVerified={domainVerified} />
}

function LiveList({
  schema,
  list,
  tab,
  entry,
  domainVerified,
}: {
  schema: CuratedSchema
  list: ListRef
  tab: ListTab
  entry?: string
  domainVerified: boolean
}) {
  const snapshot = useList(schema)
  return (
    <>
      <ListHeader schema={schema} list={list} tab={entry ? null : tab} domainVerified={domainVerified} />
      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          {entry ? (
            <EntryPage schema={schema} snapshot={snapshot} list={list} entry={entry} />
          ) : (
            <PostList schema={schema} snapshot={snapshot} list={list} tab={tab} />
          )}
        </div>
        <ListSidebar schema={schema} snapshot={snapshot} />
      </div>
    </>
  )
}

function describeRef(list: ListRef): string {
  if (list.by === 'domain') return list.domain
  const who = list.curator.type === 'pubkey' ? `${list.curator.pubkey.slice(0, 8)}…` : list.curator.address
  return `"${list.identifier}" by ${who}:`
}

export function Notice({ title, body, hint }: { title: string; body: string; hint?: string }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 max-w-prose text-ink-2">{body}</p>
      {hint ? <p className="mt-2 max-w-prose text-sm text-muted">{hint}</p> : null}
    </div>
  )
}
