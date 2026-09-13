'use client'

import type { CuratedSchema } from '@/lib/protocol/curated'
import { parseCoordinate } from '@/lib/protocol/curated'
import type { ListSnapshot } from '@/lib/store/listStore'
import { A } from '@/lib/router'
import { buildPath, type ListRef } from '@/lib/routes'
import { ProfileName } from '@/components/ui/ProfileName'
import { TimeAgo } from '@/components/ui/TimeAgo'

/** The curator's actions in time order: not a new event, the audit trail the protocol already produces. */
export function LogTab({ schema, snapshot, list }: { schema: CuratedSchema; snapshot: ListSnapshot; list: ListRef }) {
  void schema
  if (snapshot.log.length === 0) {
    return <p className="text-sm text-muted">{snapshot.loading ? 'Reading the relays…' : 'The curator has not done anything yet.'}</p>
  }
  return (
    <ol className="space-y-2 text-sm">
      {snapshot.log.map((entry) => {
        const rejected = entry.kind === 'rejected' ? parseCoordinate(entry.subject) : null
        return (
          <li key={entry.id} className="flex flex-wrap items-baseline gap-x-2 rounded-md border border-line bg-surface px-3 py-2">
            <TimeAgo seconds={entry.createdAt} className="w-20 shrink-0 text-xs text-muted" />
            {entry.kind === 'curated' ? (
              <>
                <span className="text-accent-ink">curated</span>
                <A href={buildPath({ kind: 'entry', list, entry: entry.subject })} className="text-ink hover:underline">
                  {entry.detail}
                </A>
              </>
            ) : entry.kind === 'rejected' ? (
              <>
                <span className="text-danger">rejected</span>
                {rejected ? (
                  <>
                    <A href={buildPath({ kind: 'entry', list, entry: rejected.identifier })} className="text-ink hover:underline">
                      {rejected.identifier}
                    </A>
                    <span className="text-muted">
                      by <ProfileName pubkey={rejected.pubkey} className="text-xs" />
                    </span>
                  </>
                ) : null}
                {entry.detail ? <span className="text-muted">— “{entry.detail}”</span> : null}
              </>
            ) : (
              <>
                <span className="text-note">withdrew</span>
                <span className="text-muted">{entry.subject.split(',').length} rejection(s){entry.detail ? ` — “${entry.detail}”` : ''}</span>
              </>
            )}
          </li>
        )
      })}
    </ol>
  )
}
