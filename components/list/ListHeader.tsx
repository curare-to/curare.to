'use client'

import type { CuratedSchema } from '@/lib/protocol/curated'
import { A, withBase } from '@/lib/router'
import { buildPath, type ListRef, type ListTab } from '@/lib/routes'
import { useSession } from '@/lib/store/session'

/** Where the suggest form for a list lives — a static page, reached by a full navigation. */
export function suggestHref(list: ListRef, schema: CuratedSchema, edit?: string): string {
  const to = list.by === 'domain' ? list.domain : `31889:${schema.namespace}:${schema.identifier}`
  void list
  return withBase(`/submit/?to=${encodeURIComponent(to)}${edit ? `&edit=${encodeURIComponent(edit)}` : ''}`)
}

/** The domain when the schema claims one, else its name. */
export function listDisplayName(schema: CuratedSchema, list?: ListRef): string {
  if (list?.by === 'domain') return list.domain
  return schema.domain ?? schema.name
}

export function ListHeader({
  schema,
  list,
  tab,
  domainVerified,
}: {
  schema: CuratedSchema
  list: ListRef
  tab: ListTab | null
  domainVerified: boolean
}) {
  const session = useSession()
  const tabs: { key: ListTab; label: string }[] = [
    { key: 'front', label: 'Front page' },
    { key: 'new', label: 'New' },
    // The queue is where curating happens; anyone signed in may look, only the curator may act.
    ...(session.pubkey ? [{ key: 'queue' as const, label: session.pubkey === schema.namespace ? 'Queue ✎' : 'Queue' }] : []),
  ]
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-5xl flex-wrap items-end gap-x-6 gap-y-3 px-4 pt-6">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          {schema.profileImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={schema.profileImageUrl} alt="" className="h-14 w-14 rounded-lg border border-line object-cover" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-line bg-surface-2 text-xl font-semibold text-muted">
              {listDisplayName(schema, list).slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              <A href={buildPath({ kind: 'list', list, tab: 'front' })} className="text-ink no-underline">
                {listDisplayName(schema, list)}
              </A>
              {schema.domain && !domainVerified ? (
                <span className="ml-2 align-middle text-xs font-normal text-muted" title="This schema names a domain; it has not been checked against that site.">
                  claimed
                </span>
              ) : null}
              {domainVerified ? (
                <span className="ml-2 align-middle text-xs font-normal text-accent" title={`${listDisplayName(schema, list)} serves this signed schema.`}>
                  ✓ verified
                </span>
              ) : null}
            </h1>
            <p className="truncate text-sm text-muted">{listDisplayName(schema, list) !== schema.name ? schema.name : schema.title}</p>
          </div>
        </div>
        <a
          href={suggestHref(list, schema)}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white no-underline hover:bg-accent-ink"
        >
          Suggest
        </a>
        <nav className="flex gap-1" aria-label="List tabs">
          {tabs.map((t) => (
            <A
              key={t.key}
              href={buildPath({ kind: 'list', list, tab: t.key })}
              className={`rounded-t-md border border-b-0 px-4 py-2 text-sm no-underline ${
                tab === t.key ? 'border-line bg-ground font-medium text-ink' : 'border-transparent text-muted hover:text-ink'
              }`}
              aria-current={tab === t.key ? 'page' : undefined}
            >
              {t.label}
            </A>
          ))}
        </nav>
      </div>
    </header>
  )
}
