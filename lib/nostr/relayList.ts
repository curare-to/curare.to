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

const PUBLIC = ['wss://ephemeral.mantra.press'] as const

export const READ_RELAYS: readonly string[] = PRODUCTION ? PUBLIC : LOCAL

export const WRITE_RELAYS: readonly string[] = PRODUCTION ? PUBLIC : LOCAL
