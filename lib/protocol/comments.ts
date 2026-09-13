import type { Event, EventTemplate } from 'nostr-tools/pure'

/* ------------------------------------------------------------------ *
 * Comments — NIP-22, kind 1111 — on a post (docs/conventions.md).
 *
 * A comment's root scope is the group's head: an addressable event, so the
 * root is its coordinate (`A`), its kind (`K`) and its author (`P`). A
 * top-level comment's parent is the head too (`a`, with `e` for the id
 * NIP-22 asks for beside an addressable parent, `k`, `p`); a reply's parent
 * is another comment (`e`, `k: 1111`, `p`). A post is a group of
 * coordinates, so a thread is read with every coordinate of the group as
 * one `#A` filter and merged here — a discussion that started in the queue
 * is the same discussion after the post is curated.
 * ------------------------------------------------------------------ */

export const COMMENT_KIND = 1111

export interface CommentRoot {
  /** The head's coordinate: 31890:<curator>:<d> or 31888:<suggester>:<d>. */
  coordinate: string
  kind: number
  pubkey: string
  /** The head's event id. */
  id: string
  relay: string
}

export interface Comment {
  id: string
  pubkey: string
  createdAt: number
  content: string
  /** The root coordinate the comment names (`A`). */
  root: string
  /** The parent comment's id, or null for a top-level comment. */
  parentId: string | null
  event: Event
}

export interface CommentNode {
  comment: Comment
  replies: CommentNode[]
  /** True when the parent is not in the thread (deleted, or on a relay not read). */
  orphan: boolean
}

/** An unsigned comment on a post, or a reply to a comment on it. */
export function buildCommentTemplate(options: {
  root: CommentRoot
  parent?: Comment | null
  content: string
  createdAt?: number
}): EventTemplate {
  const { root, parent } = options
  const tags: string[][] = [
    ['A', root.coordinate, root.relay],
    ['K', String(root.kind)],
    ['P', root.pubkey, root.relay],
  ]
  if (parent) {
    tags.push(['e', parent.id, root.relay, parent.pubkey], ['k', String(COMMENT_KIND)], ['p', parent.pubkey, root.relay])
  } else {
    tags.push(['a', root.coordinate, root.relay], ['e', root.id, root.relay], ['k', String(root.kind)], ['p', root.pubkey, root.relay])
  }
  return {
    kind: COMMENT_KIND,
    tags,
    content: options.content.trim(),
    created_at: options.createdAt ?? Math.floor(Date.now() / 1000),
  }
}

const tag = (event: { tags: string[][] }, name: string): string[] | undefined =>
  event.tags.find((t) => t[0] === name && typeof t[1] === 'string')

/**
 * Read a kind 1111 as a comment on some post, or null. Defensive: relays
 * carry comments from every other application, and one without a root
 * scope, or whose content is empty, is nothing to show.
 */
export function parseComment(event: Event): Comment | null {
  if (event.kind !== COMMENT_KIND) return null
  const root = tag(event, 'A')?.[1]?.trim()
  if (!root) return null
  const content = event.content.trim()
  if (!content) return null
  const parentKind = tag(event, 'k')?.[1]
  const parentId = parentKind === String(COMMENT_KIND) ? (tag(event, 'e')?.[1] ?? null) : null
  return { id: event.id, pubkey: event.pubkey, createdAt: event.created_at, content, root, parentId, event }
}

const byNewest = (a: CommentNode, b: CommentNode) =>
  b.comment.createdAt - a.comment.createdAt || (a.comment.id < b.comment.id ? 1 : -1)

/**
 * The tree: replies under their parents, orphans at the top level, every
 * level newest first (Phase 4 ranks by score). `order` may replace the
 * sort at every level.
 */
export function buildThread(
  comments: Iterable<Comment>,
  order: (a: CommentNode, b: CommentNode) => number = byNewest,
): CommentNode[] {
  const nodes = new Map<string, CommentNode>()
  for (const comment of comments) {
    if (!nodes.has(comment.id)) nodes.set(comment.id, { comment, replies: [], orphan: false })
  }
  const roots: CommentNode[] = []
  for (const node of nodes.values()) {
    const parent = node.comment.parentId ? nodes.get(node.comment.parentId) : undefined
    if (parent && parent !== node) {
      parent.replies.push(node)
    } else {
      node.orphan = node.comment.parentId !== null
      roots.push(node)
    }
  }
  const sortAll = (list: CommentNode[]) => {
    list.sort(order)
    for (const node of list) sortAll(node.replies)
  }
  sortAll(roots)
  return roots
}

export function countNodes(nodes: CommentNode[]): number {
  let n = 0
  for (const node of nodes) n += 1 + countNodes(node.replies)
  return n
}
