import { describe, expect, it } from 'vitest'
import { buildCommentTemplate, buildThread, countNodes, parseComment } from '@/lib/protocol/comments'
import { pubkeyOf, signedBy } from './keys'

const curator = pubkeyOf('curator')
const canonical = { coordinate: `31890:${curator}:thing`, kind: 31890, pubkey: curator, id: 'c'.repeat(64), relay: 'wss://r.example' }
const suggestion = { coordinate: `31888:${pubkeyOf('bob')}:thing`, kind: 31888, pubkey: pubkeyOf('bob'), id: 'd'.repeat(64), relay: 'wss://r.example' }

describe('comments', () => {
  it('builds a top-level comment and a reply the way NIP-22 describes', () => {
    const top = buildCommentTemplate({ root: canonical, content: ' hello ', createdAt: 10 })
    expect(top.kind).toBe(1111)
    expect(top.content).toBe('hello')
    expect(top.tags).toEqual([
      ['A', canonical.coordinate, 'wss://r.example'],
      ['K', '31890'],
      ['P', curator, 'wss://r.example'],
      ['a', canonical.coordinate, 'wss://r.example'],
      ['e', canonical.id, 'wss://r.example'],
      ['k', '31890'],
      ['p', curator, 'wss://r.example'],
    ])

    const signedTop = signedBy('carol', top)
    const parent = parseComment(signedTop)!
    const reply = buildCommentTemplate({ root: canonical, parent, content: 'and back', createdAt: 11 })
    expect(reply.tags.slice(0, 3)).toEqual(top.tags.slice(0, 3))
    expect(reply.tags.slice(3)).toEqual([
      ['e', signedTop.id, 'wss://r.example', pubkeyOf('carol')],
      ['k', '1111'],
      ['p', pubkeyOf('carol'), 'wss://r.example'],
    ])
    const parsedReply = parseComment(signedBy('dave', reply))!
    expect(parsedReply.parentId).toBe(signedTop.id)
    expect(parsedReply.root).toBe(canonical.coordinate)
    expect(parent.parentId).toBeNull()
  })

  it('refuses what is not a comment on anything, or says nothing', () => {
    expect(parseComment(signedBy('a', { kind: 1, tags: [], content: 'x', created_at: 1 }))).toBeNull()
    expect(parseComment(signedBy('a', { kind: 1111, tags: [['e', 'x'.repeat(64)]], content: 'x', created_at: 1 }))).toBeNull()
    expect(parseComment(signedBy('a', buildCommentTemplate({ root: canonical, content: '   ' })))).toBeNull()
  })

  it('merges a thread across the suggestion and the later canonical entry, orphans at the top', () => {
    // Before curation: two comments rooted at the suggestion, one a reply.
    const early = parseComment(signedBy('carol', buildCommentTemplate({ root: suggestion, content: 'first', createdAt: 100 })))!
    const earlyReply = parseComment(signedBy('dave', buildCommentTemplate({ root: suggestion, parent: early, content: 'reply', createdAt: 110 })))!
    // After curation: one rooted at the canonical entry, and a reply to the early comment from there.
    const late = parseComment(signedBy('erin', buildCommentTemplate({ root: canonical, content: 'later', createdAt: 200 })))!
    const lateReply = parseComment(signedBy('bob', buildCommentTemplate({ root: canonical, parent: early, content: 'still here', createdAt: 210 })))!
    // A reply whose parent is nowhere to be found.
    const orphan = parseComment(
      signedBy('frank', {
        kind: 1111,
        tags: [['A', canonical.coordinate], ['K', '31890'], ['P', curator], ['e', 'f'.repeat(64)], ['k', '1111'], ['p', curator]],
        content: 'lost',
        created_at: 300,
      }),
    )!

    const thread = buildThread([lateReply, orphan, early, late, earlyReply])
    expect(thread.map((n) => n.comment.content)).toEqual(['lost', 'later', 'first'])
    expect(thread[0].orphan).toBe(true)
    expect(thread[2].replies.map((n) => n.comment.content)).toEqual(['still here', 'reply'])
    expect(countNodes(thread)).toBe(5)
  })
})
