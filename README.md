# curare.to

A decentralized reddit built on curated lists. A subreddit is a **curated
schema event** (Nostr kind 31889), a post on its front page is a **curated
canonical event** (kind 31890), and the queue between the two is the
**curated suggestion events** (kind 31888) anyone may publish. There is no
server and no database: the site is a static export that reads relays from
the browser and signs with a NIP-07 extension.

The protocol is [bitcoin.mov](https://github.com/curare-to/bitcoin.mov)'s —
its `docs/NIP.md` is the spec and that site is the reference implementation
of one list. This repository is the client that reads many.

- **Plan:** [docs/decentralized-reddit.md](docs/decentralized-reddit.md) —
  phases 0–9, the decisions behind them, and what is deliberately left out.
- **Conventions:** [docs/conventions.md](docs/conventions.md) — how comments,
  votes, reports, labels and subscriptions address a post, in the NIP's
  register.
- **Protocol module:** `lib/protocol/curated.ts` is bitcoin.mov's
  `curatedSchemaEvent.ts`, copied verbatim and never edited here; what
  curare.to needs beyond it lives beside it (`group.ts`, `derive.ts`,
  `templates.ts`).
- **Vectors:** `vectors/` — the NIP's examples, one mutation per verification
  rule, and two events bitcoin.mov actually published. `npm test` walks them;
  a Kotlin port can too. `node test/vectors/generate.mjs` regenerates them
  deterministically.

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vitest over vectors/ and the stores
LIVE=1 npm test    # also fetch bitcoin.mov's schema over HTTPS and verify it
npm run typecheck
```

## Your own site

Any list can be a site of its own, the way bitcoin.mov is: this repository
is the template.

1. On the list's page, *Download for your own domain* saves the signed schema
   as `nostr.json` — the event exactly as published, nothing wrapped around it.
2. Fork this repository and commit that file at
   `public/.well-known/curare.to/nostr.json`. It holds only public, signed
   data, and the deploy builds from the repository, so it has to be committed.
3. In `.github/workflows/pages.yml`, give the build
   `NEXT_PUBLIC_SINGLE_LIST: /.well-known/curare.to/nostr.json`. The home page
   is then the list's front page, `?tab=new` its queue, and the directory and
   *New list* are gone; `/r/…` and `/u/…` still work.
4. Point a domain at GitHub Pages (Settings → Pages → Custom domain) and
   enable Pages with *GitHub Actions* as the source — bitcoin.mov's
   `SEEDING.md` walks through the DNS records and the certificate.

Once the domain serves the file, `curare.to/r/<your domain>/` resolves it,
and the two sites are two clients of one list. Nothing on the relays changes.

## Build & deploy

```bash
npm run build      # static site in ./out
npm run serve      # preview the export locally
```

`.github/workflows/pages.yml` deploys `out/` to GitHub Pages on every push to
`main`; the site is `https://curare.to` (Settings → Pages → Custom domain).
The build needs nothing secret — the site holds no key.
