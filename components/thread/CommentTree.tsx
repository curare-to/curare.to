'use client'

import { useState } from 'react'
import type { Event } from 'nostr-tools/pure'
import type { CommentNode, CommentRoot } from '@/lib/protocol/comments'
import { Linkify } from '@/components/ui/Linkify'
import { ProfileName } from '@/components/ui/ProfileName'
import { TimeAgo } from '@/components/ui/TimeAgo'
import { CommentForm } from './CommentForm'
import { VoteButtons } from '@/components/vote/VoteButtons'
import { ReportButton } from '@/components/mod/ReportButton'
import type { Tally } from '@/lib/protocol/reactions'
import type { Weighting } from '@/lib/store/useWeighting'

export interface CommentVoting {
  tallyFor: (id: string) => Tally
  weighting: Weighting
  relays: string[]
  writeRelays: string[]
  onVoted: (event: Event) => void
  /** Authors whose comments fold by default — the curator's bans and the viewer's mutes. */
  isMuted?: (pubkey: string) => boolean
  onReported?: (event: Event) => void
}

export function CommentTree({
  nodes,
  root,
  relays,
  onPublished,
  voting,
  depth = 0,
}: {
  nodes: CommentNode[]
  root: CommentRoot
  relays: string[]
  onPublished: (event: Event) => void
  voting?: CommentVoting
  depth?: number
}) {
  return (
    <ol className={depth === 0 ? 'space-y-4' : 'mt-3 space-y-3 border-l border-line pl-4'}>
      {nodes.map((node) => (
        <CommentItem key={node.comment.id} node={node} root={root} relays={relays} onPublished={onPublished} voting={voting} depth={depth} />
      ))}
    </ol>
  )
}

function CommentItem({
  node,
  root,
  relays,
  onPublished,
  voting,
  depth,
}: {
  node: CommentNode
  root: CommentRoot
  relays: string[]
  onPublished: (event: Event) => void
  voting?: CommentVoting
  depth: number
}) {
  const { comment } = node
  const muted = voting?.isMuted?.(comment.pubkey) ?? false
  const [replying, setReplying] = useState(false)
  const [collapsed, setCollapsed] = useState(muted)
  return (
    <li>
      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
        <button type="button" onClick={() => setCollapsed((c) => !c)} className="font-mono hover:text-ink" aria-label={collapsed ? 'Expand' : 'Collapse'}>
          [{collapsed ? '+' : '−'}]
        </button>
        <ProfileName pubkey={comment.pubkey} className="text-xs" />
        <TimeAgo seconds={comment.createdAt} />
        {node.orphan ? <span title="Its parent comment is not on the relays this site read.">reply to a comment not shown</span> : null}
        {muted ? <span title="Its author is banned by the curator or muted by you.">muted</span> : null}
      </div>
      {!collapsed ? (
        <>
          <p className="mt-1 max-w-prose whitespace-pre-wrap text-sm leading-relaxed text-ink">
            <Linkify text={comment.content} />
          </p>
          <div className="mt-1 flex items-center gap-3 text-xs">
            {voting ? (
              <VoteButtons
                target={comment.event}
                tally={voting.tallyFor(comment.id)}
                weighting={voting.weighting}
                relays={voting.relays}
                writeRelays={voting.writeRelays}
                onVoted={voting.onVoted}
                compact
              />
            ) : null}
            {replying ? null : (
              <button type="button" onClick={() => setReplying(true)} className="text-muted hover:text-ink">
                Reply
              </button>
            )}
            {voting ? <ReportButton target={comment.event} relays={voting.relays} onReported={voting.onReported} /> : null}
          </div>
          {replying ? (
            <div className="mt-2">
              <CommentForm
                root={root}
                parent={comment}
                relays={relays}
                autoFocus
                onCancel={() => setReplying(false)}
                onPublished={(event) => {
                  setReplying(false)
                  onPublished(event)
                }}
              />
            </div>
          ) : null}
          {node.replies.length > 0 ? (
            <CommentTree nodes={node.replies} root={root} relays={relays} onPublished={onPublished} voting={voting} depth={depth + 1} />
          ) : null}
        </>
      ) : (
        <p className="mt-1 text-xs text-muted">{1 + countReplies(node)} hidden</p>
      )}
    </li>
  )
}

function countReplies(node: CommentNode): number {
  return node.replies.reduce((n, r) => n + 1 + countReplies(r), 0)
}
