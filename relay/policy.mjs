#!/usr/bin/env node
// strfry write policy for relay.curare.to (docs/decentralized-reddit.md, Phase 9).
//
// strfry hands each incoming event to this program as one JSON line on stdin
// and reads one JSON line back: {"id", "action": "accept" | "reject", "msg"}.
// The relay holds exactly the kinds the site speaks and nothing else; content
// is capped by kind, and events from the future are refused.

import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

/** The kinds the site reads or writes, and what each is for. */
const KINDS = new Map([
  [0, 'profile'],
  [3, 'follow list'],
  [5, 'deletion'],
  [7, 'reaction'],
  [1111, 'comment'],
  [1984, 'report'],
  [1985, 'label'],
  [10000, 'mute list'],
  [10002, 'relay list'],
  [10889, 'subscriptions'],
  [31888, 'curated suggestion'],
  [31889, 'curated schema'],
  [31890, 'curated canonical'],
])

/** Content caps in bytes. The schema caps fields; these cap what any one event can carry. */
const CONTENT_CAP = new Map([
  [0, 16_384],
  [3, 0], // a follow list's content is unused; NIP-02 relay hints there are legacy
  [1111, 16_384],
  [1985, 2_048],
  [1984, 2_048],
  [7, 64],
])
const DEFAULT_CAP = 32_768
const FUTURE_SECONDS = 900

export function judge(event, now = Math.floor(Date.now() / 1000)) {
  if (!KINDS.has(event.kind)) return { action: 'reject', msg: `blocked: kind ${event.kind} has no reader here` }
  if (typeof event.content !== 'string') return { action: 'reject', msg: 'invalid: content is not a string' }
  const cap = CONTENT_CAP.has(event.kind) ? CONTENT_CAP.get(event.kind) : DEFAULT_CAP
  if (Buffer.byteLength(event.content, 'utf8') > cap) {
    return { action: 'reject', msg: `blocked: content over ${cap} bytes for a ${KINDS.get(event.kind)}` }
  }
  if (event.created_at > now + FUTURE_SECONDS) return { action: 'reject', msg: 'invalid: created_at is in the future' }
  if (!Array.isArray(event.tags) || event.tags.length > 2000) return { action: 'reject', msg: 'blocked: too many tags' }
  return { action: 'accept', msg: '' }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isMain) {
  const rl = readline.createInterface({ input: process.stdin })
  rl.on('line', (line) => {
    let request
    try {
      request = JSON.parse(line)
    } catch {
      return
    }
    if (request.type !== 'new' || !request.event) return
    const verdict = judge(request.event)
    process.stdout.write(JSON.stringify({ id: request.event.id, ...verdict }) + '\n')
  })
}
