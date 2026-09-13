'use client'

import type { CuratedSchema } from '@/lib/protocol/curated'
import type { PostGroup } from '@/lib/protocol/group'
import { coordinateOf } from '@/lib/protocol/group'
import type { CommentRoot } from '@/lib/protocol/comments'
import { getThreadStore, useThread } from '@/lib/store/threadStore'
import { CommentForm } from './CommentForm'
import { CommentTree } from './CommentTree'

/** The root a new comment names: the group's head — the canonical entry when there is one. */
export function rootOf(group: PostGroup, relays: string[]): CommentRoot {
  const head = group.head
  return {
    coordinate: coordinateOf(head) ?? group.coordinates[0],
    kind: head.kind,
    pubkey: head.pubkey,
    id: head.id,
    relay: relays[0] ?? '',
  }
}

/** A post's thread: the count, the form, and the tree, merged across the group's coordinates. */
export function Thread({ schema, group, relays }: { schema: CuratedSchema; group: PostGroup; relays: string[] }) {
  const thread = useThread(schema, group, relays)
  const root = rootOf(group, relays)
  const push = (event: Parameters<ReturnType<typeof getThreadStore>['pushEvent']>[0]) =>
    getThreadStore(schema, group, relays).pushEvent(event)

  return (
    <section className="space-y-4" aria-label="Comments">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
        {thread.loading && thread.count === 0 ? 'Comments' : `${thread.count} ${thread.count === 1 ? 'comment' : 'comments'}`}
      </h2>
      <CommentForm root={root} relays={relays} onPublished={push} />
      {thread.tree.length > 0 ? (
        <CommentTree nodes={thread.tree} root={root} relays={relays} onPublished={push} />
      ) : thread.loading ? (
        <p className="text-sm text-muted">Reading the relays…</p>
      ) : (
        <p className="text-sm text-muted">No comments yet.</p>
      )}
    </section>
  )
}
