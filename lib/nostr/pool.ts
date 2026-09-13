import { SimplePool } from 'nostr-tools/pool'

/**
 * A single SimplePool for the whole app.
 *
 * Stashed on `globalThis` so Next.js hot-module-reloading in dev doesn't spin
 * up a new pool (and leak websockets) on every edit. In production this is just
 * a module-level singleton.
 */
const globalForPool = globalThis as unknown as { __btcMovPool?: SimplePool }

export const pool: SimplePool = globalForPool.__btcMovPool ?? new SimplePool()

if (process.env.NODE_ENV !== 'production') {
  globalForPool.__btcMovPool = pool
}
