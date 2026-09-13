/**
 * The relays this list lives on.
 *
 * Both the app (lib/nostr/relays.ts) and the scripts (scripts/lib.mjs) read
 * from here, so publishing and reading can't drift onto different relays.
 * This file has no imports on purpose: plain Node loads it as well as the
 * bundler.
 *
 * Which set applies is decided by NODE_ENV:
 *
 *   - In the browser, Next inlines it from the *command*: `next dev` is
 *     "development", `next build` is "production", whatever the shell says.
 *     So the dev server talks to the local relay and the deployed export talks
 *     to the public ones, with no edit in between.
 *   - In the scripts it is the shell's value. Production is opt-in there:
 *     `NODE_ENV=production npm run seed` publishes to the public relays;
 *     anything else — development, or unset on a fresh clone — stays local.
 *     Publishing is the one thing here that can't be taken back, so the
 *     default is the relay nobody else can see.
 *
 * Public relays must be `wss://`: GitHub Pages is https, and a browser refuses
 * an insecure `ws://` socket from an https page — the site would connect to
 * nothing and show nothing, with no error to speak of.
 */
const PRODUCTION = process.env.NODE_ENV === 'production'

const LOCAL = ['ws://localhost:10547'] as const

// relay.curare.to first (relay/ has everything needed to run it; it must be
// standing before a deploy, or every page pays a failed connection), then
// the relay bitcoin.mov's list lives on.
const PUBLIC = ['wss://relay.curare.to', 'wss://ephemeral.mantra.press'] as const

/**
 * curare.to's one addition to bitcoin.mov's file: an explicit list wins over
 * the NODE_ENV switch, so a production build can be pointed at a local relay
 * — the end-to-end run builds the real export against the fake relay this
 * way. Comma-separated; inlined at build time like every NEXT_PUBLIC_ value.
 */
const OVERRIDE = (process.env.NEXT_PUBLIC_DIRECTORY_RELAYS ?? '')
  .split(',')
  .map((r) => r.trim())
  .filter((r) => r.length > 0)

const CHOSEN: readonly string[] = OVERRIDE.length > 0 ? OVERRIDE : PRODUCTION ? PUBLIC : LOCAL

export const READ_RELAYS: readonly string[] = CHOSEN

export const WRITE_RELAYS: readonly string[] = CHOSEN
