'use client'

import { useEffect } from 'react'
import type { Event } from 'nostr-tools/pure'
import { canSuggest, type CuratedSchema } from '@/lib/protocol/curated'
import { useList } from '@/lib/store/listStore'
import { useSession } from '@/lib/store/session'
import { profileStore } from '@/lib/store/profileStore'
import { useResolvedSchema } from '@/lib/store/useResolvedSchema'
import type { ListRef, ListTab } from '@/lib/routes'
import { ListHeader, listDisplayName } from './ListHeader'
import { ListSidebar } from './ListSidebar'
import { PostList } from './PostList'
import { EntryPage } from './EntryPage'
import { ModQueue } from '@/components/mod/ModQueue'
import { BannedTab } from '@/components/mod/BannedTab'
import { LogTab } from '@/components/mod/LogTab'

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
  return <ResolvedList schema={resolved.schema} event={resolved.event} list={list} tab={tab} entry={entry} />
}

function ResolvedList({ schema, event, list: given, tab, entry }: { schema: CuratedSchema; event: Event; list: ListRef; tab: ListTab; entry?: string }) {
  // The site's own list links its entries by coordinate once the schema is known.
  const list: ListRef = given.by === 'wellknown' ? { ...given, namespace: schema.namespace, identifier: schema.identifier } : given
  const domainVerified = given.by === 'domain'
  const session = useSession()
  useEffect(() => {
    document.title = `${listDisplayName(schema, list)} · curare.to`
    profileStore.addRelays(schema.relays)
  }, [schema, list])

  // A private list is shown only to the curator and the pubkeys it names —
  // the set canSuggest describes. Relays are open; this is the convention
  // the NIP asks clients to honour, and this site does.
  if (schema.visibility === 'private' && !canSuggest(schema, session.pubkey)) {
    return (
      <>
        <ListHeader schema={schema} list={list} tab={null} domainVerified={domainVerified} />
        <Notice
          title="This list is private"
          body="Its curator asked clients to show it only to the pubkeys it names. Relays are open, so this is a convention, not encryption — and one this site honours."
          hint={
            session.status === 'checking'
              ? 'Checking who you are…'
              : session.pubkey
                ? 'Your key is not one it names.'
                : 'Sign in with a listed key to read it.'
          }
        />
      </>
    )
  }
  return <LiveList schema={schema} event={event} list={list} tab={tab} entry={entry} domainVerified={domainVerified} />
}

function LiveList({
  schema,
  event,
  list,
  tab,
  entry,
  domainVerified,
}: {
  schema: CuratedSchema
  event: Event
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
          ) : tab === 'queue' ? (
            <ModQueue schema={schema} snapshot={snapshot} list={list} />
          ) : tab === 'banned' ? (
            <BannedTab schema={schema} relays={snapshot.relays} />
          ) : tab === 'log' ? (
            <LogTab schema={schema} snapshot={snapshot} list={list} />
          ) : (
            <PostList schema={schema} snapshot={snapshot} list={list} tab={tab} />
          )}
        </div>
        <ListSidebar schema={schema} event={event} snapshot={snapshot} />
      </div>
    </>
  )
}

function describeRef(list: ListRef): string {
  if (list.by === 'domain') return list.domain
  if (list.by === 'wellknown') return 'this site:'
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
