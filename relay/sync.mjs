#!/usr/bin/env node
// Pull the kinds the site speaks from every relay the lists on this relay
// name (NIP-77 negentropy, `strfry sync`). One direction: down, into here.
//
//   node relay/sync.mjs             run against the container in docker-compose.yml
//   node relay/sync.mjs --dry-run   print the relays and the filter, sync nothing
//   STRFRY="strfry" node relay/sync.mjs   use a local strfry binary instead

import { execFileSync, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const KINDS = [0, 3, 5, 7, 1111, 1984, 1985, 10000, 10002, 10889, 31888, 31889, 31890]
const DRY = process.argv.includes('--dry-run')
const STRFRY = process.env.STRFRY ? process.env.STRFRY.split(' ') : ['docker', 'compose', 'exec', '-T', 'strfry', 'strfry']

/** Every relay tag of every schema this relay holds, plus the seeds in SYNC_SEED_RELAYS. */
export function relaysFrom(schemaLines, seeds = []) {
  const relays = new Set(seeds)
  for (const line of schemaLines) {
    if (!line.trim()) continue
    let event
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }
    for (const tag of event.tags ?? []) {
      if (tag[0] === 'relay' && typeof tag[1] === 'string' && /^wss?:\/\//.test(tag[1])) relays.add(tag[1].trim())
    }
  }
  return [...relays]
}

function scanSchemas() {
  const out = execFileSync(STRFRY[0], [...STRFRY.slice(1), 'scan', JSON.stringify({ kinds: [31889] })], { encoding: 'utf8', maxBuffer: 1 << 28 })
  return out.split('\n')
}

function main() {
  const seeds = (process.env.SYNC_SEED_RELAYS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const relays = relaysFrom(DRY && !process.env.STRFRY ? [] : scanSchemas(), seeds)
  const filter = JSON.stringify({ kinds: KINDS })

  if (relays.length === 0) console.error('no relays to sync from: no schema here names one, and SYNC_SEED_RELAYS is empty')
  for (const relay of relays) {
    console.error(`${DRY ? 'would sync' : 'syncing'} ${relay} ← ${filter}`)
    if (DRY) continue
    const result = spawnSync(STRFRY[0], [...STRFRY.slice(1), 'sync', relay, '--dir', 'down', '--filter', filter], { stdio: 'inherit', timeout: 10 * 60 * 1000 })
    if (result.status !== 0) console.error(`  ${relay}: exit ${result.status ?? 'signal'}`)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main()
