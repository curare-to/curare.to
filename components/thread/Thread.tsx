'use client'

import { useMemo } from 'react'
import type { CuratedSchema } from '@/lib/protocol/curated'
import type { PostGroup } from '@/lib/protocol/group'
import { coordinateOf } from '@/lib/protocol/group'
import type { CommentNode, CommentRoot } from '@/lib/protocol/comments'
import { wilson } from '@/lib/rank/hot'
import { getReactionStore, useReactions } from '@/lib/store/reactionStore'
import { useSession } from '@/lib/store/session'
import { getThreadStore, orderThread, useThread } from '@/lib/store/threadStore'
import { useWeighting } from '@/lib/store/useWeighting'
import { CommentForm } from './CommentForm'
import { CommentTree, type CommentVoting } from './CommentTree'

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

/**
 * A post's thread: the count, the form, and the tree merged across the
 * group's coordinates, ordered "best" — the Wilson lower bound of each
 * comment's votes, then newest.
 */
export function Thread({ schema, group, relays }: { schema: CuratedSchema; group: PostGroup; relays: string[] }) {
  const thread = useThread(schema, group, relays)
  const root = rootOf(group, relays)
  const session = useSession()
  const weighting = useWeighting(schema)
  const targets = useMemo(() => ({ coordinates: [], ids: thread.comments.map((c) => c.id) }), [thread.comments])
  const tallyFor = useReactions(schema, relays, targets, weighting)
  const push = (event: Parameters<ReturnType<typeof getThreadStore>['pushEvent']>[0]) =>
    getThreadStore(schema, group, relays).pushEvent(event)

  const tree = useMemo(() => {
    const best = (node: CommentNode) => {
      const t = tallyFor([node.comment.id])
      return wilson(t.up, t.down)
    }
    return orderThread(thread.comments, (a, b) => best(b) - best(a) || b.comment.createdAt - a.comment.createdAt || (a.comment.id < b.comment.id ? 1 : -1))
  }, [thread.comments, tallyFor])

  const voting: CommentVoting = {
    tallyFor: (id) => tallyFor([id]),
    weighting,
    relays,
    writeRelays: session.writeRelays,
    onVoted: getReactionStore(schema, relays).pushEvent,
  }

  return (
    <section className="space-y-4" aria-label="Comments">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
        {thread.loading && thread.count === 0 ? 'Comments' : `${thread.count} ${thread.count === 1 ? 'comment' : 'comments'}`}
      </h2>
      <CommentForm root={root} relays={relays} onPublished={push} />
      {tree.length > 0 ? (
        <CommentTree nodes={tree} root={root} relays={relays} onPublished={push} voting={voting} />
      ) : thread.loading ? (
        <p className="text-sm text-muted">Reading the relays…</p>
      ) : (
        <p className="text-sm text-muted">No comments yet.</p>
      )}
    </section>
  )
}
