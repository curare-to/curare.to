# A decentralized reddit on curated lists

How curare.to becomes the reddit-shaped front to the curated-list protocol that
bitcoin.mov introduced: a subreddit is a **curated schema event** (kind 31889),
a post on its front page is a **curated canonical event** (kind 31890), and the
queue between the two is the **curated suggestion events** (kind 31888) that
anyone may publish. Nothing in this plan needs a server, a database or a new
way of signing. What it needs is a client that reads *many* lists where
bitcoin.mov reads one, and the handful of standard Nostr kinds — comments,
reactions, reports, labels, lists — that reddit's remaining features map onto.

Read this with bitcoin.mov's `lib/nostr/curatedSchemaEvent.ts`,
`lib/nostr/useVideos.ts` and `docs/NIP.md` open, and the Curare app's
`GroupCuratedSchema.kt` and `AcceptCuratedSuggestionViewModel.kt` beside them.
The protocol is written up and deployed; the group-signing side of curation is
built in the app; this plan is about the website, and **only this repository
changes**. bitcoin.mov and the Curare app are read, run and tested against,
never edited; what each would gain from this work is listed at the end, under
*Future work*, as the phases here make it possible.

**Being built.** Phases 0–9, in the order given, one commit each, all of them
in this repository; the table below records where a phase, once built, chose
differently from what the plan said. Phases 0–3 are built. Every phase is deployable on its own and none reaches
forward, except where the text says a later phase is what makes an earlier one
honest. Phases 0–2 are the request as
stated — a sub is a schema, a post is a canonical entry, and people can read
and post — and they ship as a strict superset of what bitcoin.mov does today.
Everything after is what makes it reddit rather than a directory of lists.

## Where the build chose differently

| phase | what the plan said | what it turned out to be |
|---|---|---|
| 0 | the vectors include a real suggestion from bitcoin.mov's relay | the relay held 15 canonical entries and neither the schema nor any suggestion — the source each entry names is gone. The real vectors are the served schema and one canonical entry, and the missing suggestion is the plan's case for full copies and a durable relay, observed in production |
| 0 | `npm run build` | `NODE_ENV=production next build`: a shell that exports `NODE_ENV=development` makes `next build` fail on its own error pages, and the workflow's env line is easy to forget locally |
| 1 | the domain form requires the schema's `domain` tag to name the host | a `domain` tag that is present must match; one that is absent is fine — bitcoin.mov's own published schema carries none, and the site serving the signed file is what ties the two together. The header shows the route's domain as verified |
| 1 | the Playwright run against `next dev` on the local relay | against the real static export, served the way GitHub Pages serves it (`e2e/serve.mjs`), built with `NEXT_PUBLIC_DIRECTORY_RELAYS=ws://localhost:10547` — the one addition to bitcoin.mov's `relayList.ts`. In dev, Next reloads a 404-status page after hydration and the run hung; the export is the deployment shape anyway, and the whole suite runs in two seconds |
| 1 | `/r/npub1…/bitcoin.mov` shows what `/r/bitcoin.mov` shows | not today: the production relay holds no kind 31889, so only the well-known path resolves bitcoin.mov until its schema is republished (future work in that repository). The e2e run covers the coordinate form against the local relay |
| 1 | "the same 37 entries" | the 15 the relay holds; bitcoin.mov's own page shows the same 15 |
| 2 | "the one derived field the site fills is `d`" | when the schema marks its d field `derived`. A schema that does not — the directory's "list coordinate" shape — wants the person to supply it, so the form prompts for it and its value is the identifier, checked by the field's own rules |
| 2 | `fieldProps` marks the first field of a `require-any` group required | it does, for bitcoin.mov's inline error; the form here labels every field of the group "one of Link, Text" instead, and the error still lands on the first |
| 2 | the duplicate check looks the derived `d` up in the store | after `whenLoaded()`: a form opened by a full navigation submits before the relays have answered, and an empty store is not "no duplicate" |
| 3 | "`nostr:naddr…` become links to `/r/`" | `nostr:npub…` links to `/u/`; naddr is left as text until there is a page to link it to — the list page takes an npub and a `d`, and an naddr carries both, so it is a small later addition |
| 3 | "done when … after `npm run curate` curates it" | the e2e run curates from outside the page with the run's own curator key, on a list of its own so the other specs' counts hold; bitcoin.mov's script does the same thing to the same relay, and the interop test covers that it would |
| 2 | "done when … `npm run curate` there can curate it" | proven offline: `test/interop.test.ts` (opt-in, `INTEROP=1`) publishes a suggestion built here to the fake relay seeded with bitcoin.mov's real schema and runs that repository's `curate` script in unsigned mode against it — it emits a canonical template this site verifies. No key, no network, nothing changed there |

## The mapping

| reddit | curare.to | on the wire |
|---|---|---|
| subreddit | a curated list | kind 31889 schema, at `31889:<curator>:<d>` |
| `r/name` | `/r/<curator>/<d>`, or `/r/<domain>` when the schema's `domain` verifies | `domain` tag + the well-known document |
| the mod team | the curator | one pubkey; a *team* is a FROST threshold key made in the Curare app |
| a new post, in the modqueue | a suggestion | kind 31888, in reply to the schema |
| a post on the sub's front page | a canonical entry | kind 31890, signed by the curator |
| editing a post | republishing with the same `d` | addressable events replace |
| removing a post | never curating it, and optionally saying so | NIP-32 label, kind 1985, by the curator |
| approving a post | curating it | the curator signs a kind 31890 with the suggestion's fields |
| a comment | a comment | NIP-22, kind 1111 |
| upvote / downvote | a reaction | NIP-25, kind 7, `+` or `-` |
| gilding | a zap | NIP-57, kind 9735 receipts |
| reporting a post | a report to the curator | NIP-56, kind 1984 |
| banning a user | the curator's mute list, honoured inside the sub | NIP-51, kind 10000 |
| restricted / private sub | `visibility: closed` / `private` | schema tag |
| post flair | an `enum` field | schema field |
| the sidebar | `name`, `description`, `picture`, the fields, the relays | schema tags |
| a user's profile | a profile | kind 0, NIP-05 |
| subscribing | a subscriptions list | a NIP-51-shaped list, kind 10889 (provisional — see decision 8) |
| `r/all` | the directory | every kind 31889 the directory relays hold, verified, under its curator's name |
| a multireddit | a subscription set | the same list, with a `d` |

Three sentences hold the whole thing together, and everything below is a
consequence of one of them:

1. **A sub is its curator's schema.** The curator's pubkey is the namespace and
   the only key that can put something on the front page. Nobody is delegated;
   a team is one threshold key.
2. **A post is a `d` under a sub.** Everyone who suggests the same subject
   shares a `d`; the curator's canonical entry represents the group; the
   comments and votes attach to the group, not to one of its versions.
3. **A sub's relays hold everything about it.** Suggestions, canonical entries,
   comments, reactions, reports and labels are all published to, and read from,
   the relays the schema names. There is nowhere else to look.

## What is already built

**bitcoin.mov** is the reference implementation, and most of it generalises
without change. `lib/nostr/curatedSchemaEvent.ts` builds, parses and verifies
all three kinds, dependency-free, and both the browser and the seeding scripts
load it — that is the module Phase 0 copies in. `lib/nostr/nip07.ts` is the
no-nsec boundary (sign in the extension, publish to the schema's relays,
count acceptances), `useNip07.ts` the sign-in state, `pool.ts` the one
`SimplePool`. `useVideos.ts` is the shape of the store this site needs — a
long-lived subscription feeding a map keyed by replaceable coordinate, newest
version winning, exposed through `useSyncExternalStore` — with two things
pinned that curare.to must unpin: it reads *one* schema, and it takes that
schema from `/.well-known/curare.to/nostr.json` on its own origin.
`SubmitForm.tsx` is a schema-driven form in everything but its `EMPTY` value,
which lists bitcoin.mov's fields by name; the generic form is that component
with the names read off the schema.

What does *not* generalise, and stays in bitcoin.mov: `DEFAULT_CURATED_SCHEMA`
(the film schema), `VIDEO_TYPES`, `NAMESPACE_HASHTAG`, the IMDb-aware
`deriveIdentifier`, `FilmReel`, `Poster`, and the film-shaped `Video` type in
`schema.ts`. A catalogue of films has a presentation a link sub does not, and
the plan keeps that presentation where it is.

**The NIP** (`docs/NIP.md`) is complete for the three kinds. This plan adds
nothing to their shape. It does add conventions *around* them — which
standard kinds carry comments, votes, reports and subscriptions, and how they
address a post — and Phase 0 writes them down in this repository, in the
NIP's own register, so that folding them in later is an edit rather than a
rewrite.

**The Curare app** (`curated-kmp`) has the mod-team half. A Marmot group holds
a FROST threshold key; `EditGroupCuratedSchemaScreen` publishes a kind 31889
under that key, `CuratedSuggestionListScreen` is the queue, and
`AcceptCuratedSuggestionViewModel` folds a suggestion — edited by a member —
into a kind 31890 for the quorum to sign. `CuratedSchemaEvent.kt` and
`CuratedEntryEvent.kt` are ports of the reference module, rule for rule, tested
against the NIP's own example. The website never signs as a group. It needs
to *read* what groups sign, which it can already do, and to send a team to the
app for everything else — the queue and the approve screen are already there.

**Nothing yet** discovers lists across curators, threads comments under an
entry, counts a vote, follows a list, curates from a browser, or creates a
schema without a script or the app. That is the list of phases.

## The nine decisions

### 1. curare.to is a client, not a host

Like bitcoin.mov: a Next.js static export, `nostr-tools`, relay websockets from
the browser, NIP-07 signing, deployed to GitHub Pages under the `curare-to`
organisation by the same workflow. There is no API, no database and no key on a
server. A sub's home is the relays its schema names, and curare.to reads them
the way any other client would.

The cost is that the front page of *many* subs is many relay connections, and
that nobody holds a global vote count. Phase 9 answers the first with a relay
that anyone can run and Phase 4 answers the second by saying so on screen.
Neither answer is a server the site depends on; if curare.to's relay goes away
the site is slower, not broken, and if the site goes away every sub is still
readable by the next client.

### 2. The URL is the commitment

The NIP is strict that a client must establish the curator's pubkey before it
reads a list, and must not take it from an unsigned source. bitcoin.mov takes
it from the signed event at its own well-known path. curare.to reads many
lists, so the commitment moves into the address:

```
/r/<curator>/<d>/            the coordinate, spelled out
/r/<domain>/                 a sub whose schema carries a verified domain
/r/<curator>/<d>/<entry>/    one post — the group under that d
/u/<pubkey>/                 a person: their posts, their subs, their comments
```

`<curator>` is an `npub1…`, or a NIP-05 address (`_@bitcoin.mov`,
`films@example.org`) that resolves to one. `<domain>` is the shortcut that
makes a sub feel like a place: the site fetches
`https://<domain>/.well-known/curare.to/nostr.json`, verifies the signature,
checks that the schema's own `domain` tag names that host, and only then
commits to the pubkey inside. The domain serves the file; the signature is
what is trusted — exactly bitcoin.mov's rule, applied to somebody else's site.

Whatever form the address takes, the schema is fetched, signature-verified and
parsed before anything else is read, and every event that follows is scoped to
that pubkey. Two schemas sharing a `d` on a relay are two subs at two URLs.

### 3. Approve-to-publish, with "new" as the open view

Curare is a pre-moderation protocol: nothing reaches the front page until the
curator signs it. That is reddit's *restricted* mode, not its default, and the
plan does not change it — a canonical event is the one thing the protocol
gives a reader to trust, and a front page of unsigned suggestions would throw
it away.

What a reader gets instead is the tab. Every sub has a **front page**
(canonical entries, ranked) and a **new** tab (every valid suggestion,
newest first, with the ones that have since been curated marked as such — the
NIP's "MAY mark a suggestion as accepted when a canonical event shares its
`d`"). A sub whose curator rarely curates is a sub people read on *new*, and
that is a choice the reader makes with one click, not a mode the protocol
needs.

### 4. A post is a group of coordinates

Several people may suggest the same subject and share a `d`; the curator's
canonical entry has that `d` too and names one of them as its source. The
site treats the whole set as **one post**:

```
group(schema, d) =
    { 31890:<curator>:<d> }                                 the canonical entry, if any
  ∪ { 31888:<p>:<d>  for every valid suggestion of d }      every version anyone proposed
  ∪ { the coordinate the canonical's 31888: `a` tag names } the source, even if its d differs
```

The **head** of the group is the canonical entry when there is one, else the
newest suggestion. Comments and reactions are fetched with the group's
coordinates as one `#A` / `#a` filter and shown as one thread and one score,
whichever member of the group they were attached to. A discussion that
started while a post sat in the queue is the same discussion after it is
curated; a link two people submitted has one comment section and one vote,
as it does on reddit.

Each comment and reaction still targets a real event — its `e` is an id that
exists, its `a` a coordinate that resolves — so a generic NIP-22 or NIP-25
client that opens one of the versions sees a well-formed thread under it.
Only the merge is ours.

### 5. Everything about a sub lives on the sub's relays

The NIP already requires suggestions and canonical events to go to the
schema's `relay` tags. The plan extends the rule to everything the site
attaches to a post — comments, reactions, reports, labels — and to the
curator's own lists. A reader who has the schema knows where to find all of it,
and a sub that names one durable relay is complete on that relay.

A user's own write relays (NIP-65, kind 10002) get a copy of what they publish
when the site knows them, so their profile on other clients shows the
activity; that is a courtesy, not where anything is read from.

### 6. Signing: a NIP-07 extension in the browser; teams use the app

The browser never sees a private key. Everything the website signs — a post,
a comment, a vote, a single-key curator's approval — goes through a NIP-07
extension, as bitcoin.mov does, and nothing else. A team's threshold key
signs nowhere but the Curare app, in a FROST ceremony among its members, and
the app already has the queue and the approve screen for it. So the website
does not try to reach a team's key at all: where a curator's key is not in
the extension, it says so and sends them to download the app. One signing
path in the browser, one in the app, and no bridge to keep honest between
them.

### 7. Scores are computed by the viewer, and say so

There is no server to hold a vote total, so there is no total — there is a
count of the reactions this client fetched from these relays, weighted the way
this viewer chose. Phase 4 ships raw counts labelled as such, then a web-of-trust
weighting drawn from the viewer's own follow list (and the curator's, for a
viewer who is signed out). Anyone can make a thousand keys; the site's answer
is not to pretend otherwise but to let the viewer count the keys they trust.

### 8. Subscriptions get a kind of their own

The obvious home for "subs I follow" is NIP-51's kind 10004, *Communities*. It
is defined for kind 34550 coordinates, and any NIP-72 client that rewrites a
user's community list from its own model would drop the 31889 entries it does
not understand. Follow lists have been clobbered this way before. So
subscriptions are a NIP-51-*shaped* list — `a` tags of 31889 coordinates,
NIP-44-encrypted private items in `.content` — under a replaceable kind of the
family's own, **10889** provisionally, to be registered when the NIP is
submitted. A multireddit is the same shape as an addressable set with a `d`.

### 9. The directory lists every schema it finds, and the protocol module is copied in — for now

`r/all` is every kind 31889 the directory relays hold: each one
signature-verified and parsed, the newest per coordinate, shown under its
curator's name, and nothing more. That is a list anyone can put anything on,
and the page says so; what keeps it usable is the viewer — a *hide* on any
row, and their own mute list applied here as everywhere. The obvious next
step, a directory that is itself a curated list (the site's own schema whose
entries are subs, curated with the same three kinds), is future work in this
repository, and it is also the moment the site would first hold a key. Until
then it holds none.

And the protocol module comes in as a **copy**: bitcoin.mov's
`lib/nostr/curatedSchemaEvent.ts`, verbatim, with the commit it was taken
from recorded at the top of the file. That is a second definition, which is
exactly what bitcoin.mov's "no second copy to keep in sync" rule forbids — and
the rule is right. The plan pays the price knowingly, because the alternative
is a shared package that changes bitcoin.mov's deploy and the Curare app's
tests before a single sub renders here, and this plan does not touch either
repository. Two things keep the copy honest until the package exists: it is
never edited, only wrapped — everything curare.to needs beyond it lives in
files beside it — and its tests include the events bitcoin.mov actually
published, so a rule the two copies disagree on fails here before it misleads
anyone. Extracting the package is the first item of future work, and the copy
is laid out so that the extraction is a move.

## Phase 0 — the repository and the protocol module

*Nothing visible yet. The repository exists, builds, deploys an empty site,
and carries a tested copy of the protocol.*

### Bootstrapping

`curare-to/curare.to` starts from copies of bitcoin.mov's `next.config.mjs`,
`tsconfig.json`, `postcss.config.mjs`, `.github/workflows/pages.yml` (branch
`main`, site `https://curare.to`), `public/.nojekyll`, `types/nostr.d.ts`,
and the four Nostr modules that generalise unchanged: `pool.ts`, `nip07.ts`,
`useNip07.ts`, `relayList.ts`. Copying is reading; bitcoin.mov is not changed.

### The module

```
lib/protocol/
  curated.ts       bitcoin.mov's lib/nostr/curatedSchemaEvent.ts, verbatim, with one
                   header line naming the commit it was copied from — never edited here
  group.ts         postGroup (decision 4) — pure, given a schema and events
  derive.ts        the `d` rules the templates use (Phase 6 fills these in)
  templates.ts     the reddit-shaped default schemas (Phase 6 fills these in)
vectors/
  schema/          kind 31889 events, valid and invalid, with the expected reason
  suggestion/      kind 31888, likewise
  canonical/       kind 31890, likewise
  group/           a schema, a pile of events, and the groups they must form
docs/
  conventions.md   what this plan layers on the NIP — see below
```

`curated.ts` is bitcoin.mov's, `DEFAULT_CURATED_SCHEMA`, `VIDEO_TYPES` and
all: the unused exports cost nothing, and a verbatim file is one `diff` away
from knowing whether it has drifted. The two places it is bitcoin.mov-specific
— the `d` derivation (IMDb ids) and the `t` hashtags (`bitcoin`, plus the
film's type) — are reached only through `derived` fields, and curare.to never
gets there: it passes every `d` through `BuildOptions.identifier`, which the
module already honours, and its templates declare no derived `t`. Those two
rules then fire only when the schema is bitcoin.mov's own, where they are
right.

### Vectors

Every file under `vectors/` is `{ "event": …, "schema": …?, "expect": "valid" |
"invalid", "reason": "…"? }`. The starting point is the NIP's own examples — the
schema, the suggestion by `eebb74ab…`, the canonical by `7c965d8c…` — plus one
mutation per verification rule in the NIP (a missing required field, a
repeated non-`repeat` tag, a bad `visibility`, a canonical signed by the wrong
key, a `31888:` `a` tag that is not a coordinate, a `relay` that is not a
websocket URL). The reason codes are the ones `CuratedSchemaViolation` already
carries. Beside them, saved exactly as fetched: the signed schema bitcoin.mov
serves at its well-known path, and one suggestion and one canonical entry from
its relay — what the protocol looks like in production, not only in its spec.

The TypeScript tests (vitest) walk the directory. It is files rather than test
code so that the app's Kotlin tests can walk the same directory one day; that
is future work in that repository.

### Conventions

`docs/conventions.md` is the section the NIP does not have and this plan
needs: how comments, reactions, reports, labels and subscriptions address a
post (decision 4's group), that they go to the schema's relays (decision 5),
the provisional kind 10889, and that the well-known document SHOULD be served
with permissive CORS so that a client on another origin can fetch it — GitHub
Pages already does; a sub hosted elsewhere has to. It is written in the NIP's
register so that folding it into `NIP.md` later is an edit, not a rewrite.

CI: `npm ci && npm test && npm run build`.

**Done when** the vectors pass, the signed schema bitcoin.mov serves today
parses and verifies through the copy, and an empty site deploys to
`https://curare.to`.

## Phase 1 — one sub, read-only

*`/r/bitcoin.mov` on curare.to shows what `bitcoin.mov` shows, from the same
relays, and so does `/r/npub1…/bitcoin.mov`. Nothing is signed.*

### Resolving a sub

`lib/resolve/schema.ts` turns an address into a verified schema, or a reason:

| address | how |
|---|---|
| `npub1…` + `d` | `{"kinds":[31889],"authors":[pk],"#d":[d]}` on the site's directory relays, then on any `relay` tag the result names, newest `created_at` winning and ties broken on `id` (as `GroupCuratedSchema.newestPerListAmong` does) |
| `name@domain` + `d` | NIP-05 (`nostr-tools/nip05`) to a pubkey, then as above |
| `domain` | `GET https://<domain>/.well-known/curare.to/nostr.json`; the body must be a signed kind 31889 whose `domain` tag is that host; then the relay lookup, to catch a newer revision |

Every path ends in `verifyEvent` and `parseCuratedSchemaEvent`; a schema that
fails either is "not a sub", with the reason shown. The result is cached per
coordinate for the session, the way `useSiteSchema` caches one.

### The store

`lib/store/listStore.ts` is `VideoStore` with the two pins removed: it is
constructed **per schema coordinate**, subscribes to that schema's `relay` tags
(falling back to the directory relays when it names none), and holds two maps —
suggestions by `pubkey:d`, canonical entries by `d` — each keeping the newest
version. `useList(coordinate)` is the hook. Stores are kept in a module-level
map so that two components looking at the same sub share one subscription,
and are closed when nothing has looked at them for a minute.

The filters are the NIP's:

```jsonc
{"kinds":[31888],"#a":["31889:<curator>:<d>"]}                          // new
{"kinds":[31890],"authors":["<curator>"],"#a":["31889:<curator>:<d>"]}  // front
```

Every event is run through `verifyCuratedSuggestion` /
`verifyCuratedCanonical` against the resolved schema and dropped with its
reason if it fails — rejected, never repaired.

`lib/store/postGroup.ts` is `lib/protocol/group.ts` applied to the store's
snapshot: one group per `d`, with a head, a state (`curated`, `pending`) and
the coordinate list later phases query on.

### Rendering an entry nobody has seen the schema of

bitcoin.mov knows it is showing films. curare.to reads the schema and renders
by field **type**:

| field | becomes |
|---|---|
| the `title` field | the post title |
| the first `url` field (preferring a `link` marker) | the post link, shown as its hostname the way reddit does |
| any `image` field | the thumbnail; the ₿ placeholder becomes a generic one |
| an `enum` field | a flair chip, and a filter on the front page |
| the field whose `tag` is `content`, or any `longtext` | the body, plain text, linkified with safe schemes only |
| `year`, `duration`, `number`, `token`, `text` | a details table on the post page, labelled by the field's `label` |
| `t` tags | hashtags |

Every string is text, never HTML; every `href` and `src` passes `isSafeUrl`
at the point of rendering, whatever the schema verified. When the schema has an
image field the front page is a card grid; otherwise it is the list.

### Pages

- `/r/<…>/` — header (`name` or verified `domain`, `picture`), the **front**
  and **new** tabs, and the sidebar: description, curator (kind 0 profile and
  NIP-05 when it resolves), visibility, the relays, "N entries, M suggested",
  and the fields a post needs.
- `/r/<…>/<entry>/` — the group: the head in full, the other versions folded
  under "also suggested by", and (from Phase 3) the thread.
- A `visibility: private` sub shows nothing to a viewer who is not the curator
  or in its `p` tags, and says so — the convention the NIP asks clients to
  honour.

### Routing on a static host

`output: 'export'` cannot emit a page per sub. The static pages (`/`, `/all/`,
`/new/`, `/submit/`, `/about/`) are real exports; `/r/…` and `/u/…` are served
by the `404.html` that `app/not-found.tsx` becomes, which mounts a small client
router (`lib/routes.ts`: parse and build, both directions, with `d` and entry
identifiers `encodeURIComponent`-ed) over `window.location` and `pushState`.
GitHub Pages returns that page with a 404 status, which browsers ignore and
link-preview bots do not; Cloudflare Pages or Netlify turn the same `out/`
into a 200 with one `_redirects` line, and moving there later costs nothing
else. Links into dynamic routes are plain anchors handled by the shell, not
`<Link>`s, so Next's own router never tries to fetch a payload that does not
exist.

### Tests

- `resolve`: each address form against a fake relay and a fake fetch; a schema
  with a wrong `domain`, a bad signature, a missing `visibility`.
- `listStore`: the same event from two relays, two versions of one entry, an
  invalid one, a canonical from a non-curator — all against an in-process
  websocket relay (`ws` server speaking NIP-01 subset), since `SimplePool` has no
  fake.
- `postGroup` against the vectors.
- `routes`: every form round-trips.
- One Playwright run against a local relay on `ws://localhost:10547` — the
  port bitcoin.mov's dev setup uses, so one relay serves both checkouts. The
  run's own setup publishes the valid events under `vectors/` to it (a schema
  from a throwaway key, a dozen posts, some of them curated) and nothing else
  does: there is no seed script in this repository. bitcoin.mov's
  `npm run seed`, unchanged, fills the same relay with the film list when its
  checkout is beside this one.

**Done when** `curare.to/r/bitcoin.mov` and `bitcoin.mov` show the same 37
entries, and a sub nobody has a site for renders at its coordinate.

## Phase 2 — signing in and posting

*Anyone with an extension can put an entry in a sub's queue, and edit it later.*

### Sign-in

`useNip07` and the header's sign-in state come across unchanged. Signed in
means: a pubkey, a kind 0 profile fetched for the header, and the pubkey's
kind 10002 relay list fetched for the courtesy copy in decision 5.

### The form

`components/entry/EntryForm.tsx` is `SubmitForm` with the field names read off
the schema: `formFields(schema)` gives the fields to prompt for, `fieldProps`
the input attributes, `validateValues` the errors, and one `FieldInput` per
field type (`text`, `longtext`, `token`, `url`, `image`, `enum`, `year`,
`duration`, `number`). The one derived field the site fills is `d`, from the
sub's template rule (Phase 6 defines them; until then the slug fallback),
passed through `BuildOptions.identifier` so the copy's own rule never runs.
`canSuggest(schema, pubkey)` gates the form the way it gates bitcoin.mov's.

Submitting builds `buildCuratedSuggestionTemplate`, signs through
`signAndPublish`, publishes to the schema's `relay` tags plus the user's write
relays, and pushes the signed event into the store so it appears before it
echoes back. The `/submit/?to=<coordinate>` page hosts the form outside a sub
too, so "post to…" can be linked from anywhere.

### Editing

Your own suggestion has an *Edit* that reopens the form with `eventToValues`
and republishes under the same `d` — the entry is replaced, and if the curator
had already curated it the head stays the curator's version until they
re-curate. The page says so.

### Duplicates

Before publishing, the form looks up the derived `d` in the store; if the group
exists it says "already suggested by …" with a link, and offers to publish
anyway (a second version is legitimate) — reddit's "this link has been
submitted before".

### Tests

The form against every field type and the `require-any` rule; a `closed` sub
refusing a stranger; a publish to a relay that rejects (the `pool.publish`
"connection failure" quirk `nip07.ts` already handles).

**Done when** a suggestion made on curare.to appears in bitcoin.mov's
`/suggestions`, and `npm run curate` there — unchanged, as the interop check —
can curate it.

## Phase 3 — comments

*A post has a thread. The thread survives the post being curated.*

### The events

A top-level comment on the group's head, per NIP-22:

```jsonc
{
  "kind": 1111,
  "content": "…",
  "tags": [
    ["A", "31890:<curator>:<d>", "<relay>"],   // root: the head's coordinate
    ["K", "31890"],
    ["P", "<curator>", "<relay>"],
    ["a", "31890:<curator>:<d>", "<relay>"],   // parent: same, for a top-level comment
    ["e", "<head event id>", "<relay>"],       // NIP-22: addressable parents also carry their id
    ["k", "31890"],
    ["p", "<curator>", "<relay>"]
  ]
}
```

On a post still in the queue the head is a suggestion, so `A`/`a` are
`31888:<suggester>:<d>`, `K`/`k` are `31888`, and `P`/`p` the suggester. A reply
to a comment keeps the root tags and points `e`/`k: 1111`/`p` at the parent
comment. Comments go to the sub's relays (and the author's write relays).

### Reading

`lib/store/threadStore.ts`, per group:

```jsonc
{"kinds":[1111],"#A":[…every coordinate in the group…]}
```

The tree is built from `e` parents, orphans attached to the root, sorted
*best* (Phase 4's score, until then newest). The count on the front page comes
from the same subscription, batched per page of groups; NIP-45 `COUNT` replaces
it on relays that support it in Phase 9.

### Rendering

Plain text. URLs become links after `isSafeUrl`; `nostr:npub…` and
`nostr:naddr…` become links to `/u/` and `/r/`; nothing is rendered as HTML and
no image is loaded from a comment. A safe markdown subset is in the appendix,
not this phase.

### Tests

A thread across a suggestion and its later canonical merges into one; a reply
to a missing parent lands under the root; comments by a pubkey the viewer has
muted (Phase 8) are folded.

**Done when** a comment left on a queued post is still under it after
`npm run curate` curates it.

## Phase 4 — votes and ranking

*The front page has an order that is not "newest", and the order is explained.*

### The events

A vote is a NIP-25 reaction on the version the viewer is looking at:

```jsonc
{
  "kind": 7,
  "content": "+",                                    // "-" for a downvote
  "tags": [
    ["e", "<event id>", "<relay>"],                  // MUST, per NIP-25
    ["a", "31890:<curator>:<d>", "<relay>"],         // SHOULD, for addressable events
    ["p", "<author of the event>"],
    ["k", "31890"]
  ]
}
```

Read with `{"kinds":[7],"#a":[…group…]}`. One vote per pubkey per group — the
newest reaction by each pubkey wins, so changing your vote is publishing again,
and an emoji counts for nothing, as the NIP says. Zap receipts (kind 9735) are
fetched the same way and summed in sats for a *top by sats* sort; the sats
are what makes the number hard to fake, and they are the only number here that
is.

### Ranking

`lib/rank/hot.ts` is reddit's: `sign(s)·log10(max(|s|,1)) + t/45000`, with `t`
the head's `created_at` relative to an epoch and `s` the net score. *Top* is
net score over a window; *new* is `created_at`; *best*, for comments, is the
Wilson lower bound. Nothing needs a server because nothing needs a total —
each page ranks what it fetched.

### Weighting

`lib/rank/wot.ts`: with a viewer signed in, votes from pubkeys in their kind 3
follow list weigh 1, everything else weighs a configurable default (0.2, and
0 is a click away). Signed out, the curator's follow list stands in. The
score shown carries a label — *everyone* or *trusted* — and a hover that says
what the two numbers are. Second-hop follows are the appendix's problem; they
need an index.

### Tests

Reactions from one key in both directions collapse to the last; a reaction
with no `a` (an old client) still counts via its `e`; hot ordering matches a
fixture of reddit's own examples.

**Done when** the front page of a sub with votes on it reorders, and the
number on a post says which count it is.

## Phase 5 — curating from the browser

*A curator who holds their key in an extension does what `npm run curate`
does, on the page.*

### The mod view

Signed in as the schema's pubkey, a sub gains a **queue** tab: every pending
group, the reports on it (Phase 8), and three actions.

- **Approve** builds `buildCuratedCanonicalTemplate` from the head — keeping
  its `d`, naming it as source with the `31888:` `a` mention and `e` id — signs
  via NIP-07 and publishes to the schema's relays. The store is told, so the
  post moves to the front page at once.
- **Edit, then approve** opens `EntryForm` prefilled with the suggestion and
  signs the edited values as the canonical event — the "curation is editorial"
  rule.
- **Reject** publishes a NIP-32 label the queue can hide by:

  ```jsonc
  {
    "kind": 1985,
    "content": "why, in a sentence — optional",
    "tags": [
      ["L", "curare.to"],
      ["l", "rejected", "curare.to"],
      ["a", "31888:<suggester>:<d>", "<relay>"],
      ["p", "<suggester>"]
    ]
  }
  ```

  Read with `{"kinds":[1985],"authors":["<curator>"],"#L":["curare.to"]}`. A
  rejection is undone by curating the entry after all, or by a kind 5 deletion
  of the label. The suggester sees the label and its reason on their own entry;
  nobody else's *new* tab shows the entry unless they ask for rejected ones.

**Add directly** is the same form with kind 31890 and no source — the
curator's own entry, which the NIP allows.

### Whose key

`canCurate(schema, pubkey)` is the gate, and it is the extension's pubkey.
When the signed-in key is not the curator's, the queue is read-only and says
why: *this list is curated by a key that is not in your extension — teams
curate in the Curare app*, with the download link. The site cannot tell a
threshold key from any other, and does not need to: the app's queue is the
same queue, read from the same relays, and the approve screen there is what
signs. There is no delegation to build because the protocol has none: the
`p` tags on a schema name suggesters.

### Re-curation

A group whose canonical entry is older than its head suggestion (the suggester
edited after approval) is flagged in the queue as *updated since curated*, with
a diff of the field values, and *approve* republishes under the same `d`.

### Tests

Approve produces an event `verifyCuratedCanonical` accepts and bitcoin.mov's
`npm run verify` accepts; approve by a non-curator is refused before the
extension is asked; a rejected entry disappears from *new* and reappears when
curated.

**Done when** the bitcoin.mov curator can run the film list from
`curare.to/r/bitcoin.mov` without the scripts.

## Phase 6 — creating a sub

*A schema is published from a form, not a script — and any sub can become its
own site.*

### Templates

`lib/protocol/templates.ts`, and the choice `/new/` opens with:

| template | fields | `d` is derived from |
|---|---|---|
| **Links & text** (reddit's default) | `title`; `link` (`url`, tag `r`, marker `link`, optional); `body` (`longtext` → `content`, optional); `image` (optional); `flair` (`enum`, options the creator sets); `require-any: link, body` | the link's canonical form when there is one (`url:` + 16 hex of its SHA-256, so the same link is one post); otherwise `slug(title)` + 6 hex of the author's pubkey, so two people's same-titled posts are two posts and one person's is an edit |
| **Discussion** | `title`, `body` required; `flair` | as above, without the link rule |
| **Catalogue** (bitcoin.mov's shape) | `title`, `year`, `type` enum, `externalId` (`i`), links by marker, `image`, `lang`; `require-any` of the links | the external id, else `slug(title-year)` — bitcoin.mov's rule, generalised |
| **Custom** | the field editor | whichever rule the creator picks |

The derivation rule is recorded in the identifier field's `hint`, since it is
the publishing client that applies it and a client that does not know the
rule can still read the hint. No template declares a derived `t` field: the
copy's hashtag rule is bitcoin.mov's (Phase 0), and a sub is its own topic —
flair is the sub-topic.

### The editor

Name, description, picture, visibility (and the `p` list for `closed` /
`private`), domain (a claim, labelled as such until verified), relays (a
picker over the directory relays plus free entry; every value must pass
`isRelayUrl`), then the fields: add, remove, reorder, and per field the type,
optionality, label, placeholder and the config keys its type allows. The
mandatory `d` and `title` fields are shown and cannot be removed.
`verifyCuratedSchemaEvent` runs on every change and the publish button lists
its violations until there are none.

Publishing signs a kind 31889 via NIP-07 — **the extension's pubkey becomes the
curator**, said in so many words above the button — and sends it to the chosen
relays. The new sub opens at its coordinate URL, and is on `/all/` as soon as
a directory relay has it (Phase 7) — nobody's say-so required. Editing a sub
is the same editor, prefilled, republishing under the same `d`.

Group-curated subs are made in the Curare app, which already has this editor;
the web page says so and links there.

### Make it a site

A *Download for your own domain* on the sub page gives the signed schema as
`nostr.json`, and this repository is the template: built with
`NEXT_PUBLIC_SINGLE_LIST=/.well-known/curare.to/nostr.json`, curare.to shows
one sub at `/` — Phase 1's page, pinned to the well-known file the way
bitcoin.mov is pinned to its own — and leaves out the directory, `/new/` and
the rest. Fork this repository, commit the file, set the variable in the
workflow, point a domain at Pages: bitcoin.mov's "Before going live", repeated
in this README's *your own site* section. Once the domain serves the file,
`/r/<domain>` on curare.to resolves it, and the two sites are two clients of
one list. A smaller template repository, with the directory code stripped
out, is future work; the build mode is what makes that a copy rather than a
design.

### Tests

Each template publishes a schema the copied module verifies and Phase 2's form can
fill; the editor refuses to remove `d`; a `ws://` relay is refused for a
production sub; the link rule collapses `http://x/a?utm=1` and `https://x/a`.

**Done when** a sub created on `/new/` accepts a post from a second browser,
and a fork of this repository built in single-list mode shows it at `/`.

## Phase 7 — the directory, subscriptions and home

*There is somewhere to go from the front door, and a front door that is yours
once you have subscribed to something.*

### The directory is every schema

`/all/` is a paged scan of the directory relays:

```jsonc
{"kinds":[31889],"limit":100,"until":<oldest created_at seen>}
```

Every result goes through `verifyEvent` and `parseCuratedSchemaEvent` — a bad
signature, a missing `visibility`, a malformed `relay` never reach the page —
and the newest event per coordinate wins, ties broken on `id`, as in Phase 1.
A row is the schema's `name` (or its `domain`, labelled as a claim until
Phase 8 verifies it), its `description`, its `picture`, its curator (the
kind 0 name and NIP-05 when they resolve, else the npub), its `visibility`,
and when it was last revised; it links to `/r/<npub>/<d>`. Newest first. A
text filter over name and description runs on what is loaded, and NIP-50
`search` is passed to relays that advertise it.

What the page is not is judged. A relay scan lists whatever anyone published,
and a line at the top says so. Two things keep it usable: the viewer's own
mute list (kind 10000) hides a muted curator's schemas here as everywhere,
and a *hide* on any row remembers the coordinate locally. A `private` schema
is shown only to its curator and its `p` set. A curated directory — a list of
lists, in the same three kinds — is future work in this repository.

### Subscriptions

```jsonc
{
  "kind": 10889,                                        // provisional, decision 8
  "tags": [["a", "31889:<curator>:<d>", "<relay>"], …],  // public subscriptions
  "content": "<NIP-44 of the same array>"               // private ones
}
```

Read with `{"kinds":[10889],"authors":["<me>"]}` from the viewer's write
relays and the directory relays; written to both. A subscribe button on every
sub; a `d`-bearing set of the same shape for a multireddit, in a later cut.

### Home

Signed in with subscriptions: one feed, the union of the subscribed subs'
front pages ranked by Phase 4's hot, with the sub's name on each row. Each
sub's store is the Phase 1 store; the feed opens the first page of each and
merges. Signed out, or subscribed to nothing: the directory, and the hottest
posts across the twenty most recently revised subs on it — first page each,
until Phase 9 makes "all of them" cheap.

### Tests

A schema with a bad signature or no `visibility` never reaches the list; two
revisions of one coordinate show once, the newer; a `private` schema shows
only to its `p` set; a hidden row stays hidden across a reload; the
subscriptions list round-trips public and private items; the home feed merges
two subs' pages in hot order.

**Done when** `curare.to/all/` lists bitcoin.mov among everything on its relay,
subscribing to it puts its front page on `/`, and a schema published from
Phase 6's editor appears there without anyone's say-so.

## Phase 8 — moderation depth

*The tools reddit moderators reach for, from the kinds Nostr already has.*

- **Bans.** The curator's kind 10000 mute list applies inside their sub: a
  muted pubkey's suggestions are hidden from *new* and its comments folded,
  and `word` entries hide matching titles. Editing the list is the mod view's
  *banned* tab; it is the curator's ordinary mute list, so other clients honour
  it too. The viewer's own mute list applies everywhere.
- **Reports.** A *report* on any post or comment publishes NIP-56 kind 1984 to
  the sub's relays — `["e", "<event id>", "spam"]` with the type as the third
  element, and the author's `p`; NIP-56 has no `a`, so a report names the
  version on screen and the mod view finds them with
  `{"kinds":[1984],"#e":[…every id the store has seen for the group…]}`,
  counting per group and listing the reasons. Reports are the one thing the
  site reads from the sub's relays but never shows to a non-curator.
- **Closed and private.** The `p` list is editable in the sub editor; a
  `private` sub is fetched only for a viewer in the set and never appears in
  the directory scan for anyone else — the client-side convention, honoured
  everywhere the site shows a list.
- **Verified.** `verifyDomain` runs when a schema carries a `domain`, and the
  header shows a check only when both the NIP-05 `_` lookup and the well-known
  document name the curator. Users get the same treatment from their NIP-05.
- **A mod log.** Not a new event: the curator's canonical events, labels and
  deletions in time order, which is the audit trail the protocol already
  produces. Shown on the sub's *log* tab.

**Done when** a muted pubkey's post vanishes from *new* for every viewer and a
report shows in the queue.

## Phase 9 — a relay of our own, and caching

*The home feed across a hundred subs opens in a second, and a list that lived
on one relay survives that relay.*

### `wss://relay.curare.to`

A strfry with a write policy that accepts exactly the kinds the site speaks —
`0, 3, 5, 7, 1111, 1984, 1985, 10000, 10002, 10889, 31888, 31889, 31890` —
with size caps, and a scheduled NIP-77 negentropy sync (`strfry sync`) that
pulls those kinds from every relay named by every schema it has seen. It is
the default in the site's directory-relay list; it is a cache, not an
authority, and the list is a setting the viewer can edit. Any sub may add it
to its `relay` tags.

Everything needed to run one lives in this repository, under `relay/`: the
strfry config, the write-policy plugin, the sync script and its schedule, and
a README — so that "anyone can run one" is a command and not a promise.

It is also what a durable home for bitcoin.mov's list would be — its schema
names one relay, and that relay is called *ephemeral*. Giving it a second
`relay` tag is a republish of that schema in that repository, listed under
future work; nothing here waits on it.

### Caching

Events are stored in IndexedDB per coordinate with the newest `created_at`
seen, so a returning viewer renders from cache and subscribes with `since`.
Comment counts use NIP-45 `COUNT` where a relay advertises it (NIP-11), the
Phase 3 subscription elsewhere. A service worker caches the export so the
shell loads offline and the relays are the only network.

**Done when** the signed-out home page opens in under a second on a warm cache
with the whole directory behind it, and every schema the directory shows is
on the relay.

## Rollout

1. Phase 0 first and alone: the copy of the module, its vectors and the
   empty deploy, with `curare.to` DNS pointed at GitHub Pages under the
   organisation — the steps are bitcoin.mov's "Before going live" — and the
   domain verified at the organisation level.
2. Phase 1 deploys with `/r/bitcoin.mov` as the smoke test: it reads
   bitcoin.mov's list from its relay, and changes nothing there.
3. Phases 2–5 in order; each is one branch, merged when its tests and its
   *done when* hold against the local relay and then against
   `ephemeral.mantra.press`.
4. Phase 9's relay before Phase 7's "all of them" is switched on.
5. `docs/conventions.md` is offered to the NIP after Phase 7, when everything
   in it has been exercised and kind 10889 has a case to make — the first of
   the future-work items to become worth doing.

## What this does not do

- **Hold a key.** Not in the browser, not on a server, not in CI. Signing is
  the extension in the browser, or the app.
- **Sign for a team from the web.** No remote signing, no bridge to the app's
  ceremonies: a team downloads the Curare app and curates there. The website
  reads what the team signs.
- **Render on a server.** There is none. A post page is fetched from relays in
  the viewer's browser every time, and cached there.
- **Publish a global score.** Every number is this viewer's count of these
  relays, weighted by this viewer's follows, and labelled.
- **Make `private` private.** Relays are open; the site honours the convention
  and says so on the sub. Nothing secret belongs in a list.
- **Delegate curation.** The protocol has one curator per schema. A team is a
  threshold key, and the app is where one is made.
- **Host media.** Images are URLs the poster supplies. Blossom uploads are a
  later note.
- **Write to NIP-72.** Reading a kind 34550 community as a sub is in the
  appendix; publishing kind 4550 approvals is not planned.
- **Judge the directory.** `/all/` is everything the directory relays hold,
  verified but not chosen; the site holds no key and vouches for nothing on
  it. A curated list of lists is future work here.
- **Search.** NIP-50 `search` on relays that support it is a filter the
  directory can pass through; there is no index.
- **Touch bitcoin.mov or the Curare app.** Both are read from, run and tested
  against exactly as they are; nothing in Phases 0–9 edits either repository.
  Groups, ceremonies and group-signed curation stay in `curated-kmp`; the film
  presentation and its deploy stay in bitcoin.mov. What each would gain from
  this work is under *Future work*.

## Future work

None of this is in a phase.

### In this repository

- **A curated directory.** `/all/` as a list of lists: a schema published by
  the site's own key whose entries are subs — the sub's coordinate as the
  entry's `d`, since a `d` may contain colons and the NIP splits on the first
  two, so two people suggesting the same sub share an entry and "is it
  listed?" is one `#d` query — suggested by anyone through Phase 2's form,
  curated in Phase 5's mod view, made in Phase 6's editor, and served at
  `https://curare.to/.well-known/curare.to/nostr.json` exactly as bitcoin.mov
  serves its own. The same three kinds and no new tag; Phase 7's scan stays
  as the unfiltered view behind it. It is the point at which the site first
  holds a key, which is a reason to wait until the scan has shown what needs
  curating.
- **Pre-rendering listed subs.** A build-time refresh of `data/directory.json`
  from that curated list — committed, like bitcoin.mov's well-known file, so
  the build needs no network — with `generateStaticParams` emitting a real
  `/r/<domain>/` for every listed sub with a verified domain: a 200 and a link
  preview instead of the 404 shell. Waits on the curated directory, which is
  what makes "listed" mean something.

### In the other repositories

Each row is what another repository would gain once the phase beside it has
shipped here, and each is a change made in that repository, on its own
schedule, by its own rules.

| repository | what | ready after |
|---|---|---|
| `curare-to/protocol` (new) | the shared package: `lib/protocol/curated.ts` moved out with `vectors/`, `NIP.md` and the per-kind docs beside it; compiled JS and `.d.ts` in `dist/`, since Node will not strip types under `node_modules`; consumers pinning a git tag until npm is worth it. The copy here is laid out so that this is a move | Phase 0 |
| `curare-to/bitcoin.mov` | replace `lib/nostr/curatedSchemaEvent.ts` with the package in the one change that adds the dependency, so there is never a moment with two definitions; `deriveIdentifier` and the `t` rule stay behind as bitcoin.mov's own, passed in through `BuildOptions` | the package |
| `curare-to/bitcoin.mov` | republish the film schema with `wss://relay.curare.to` as a second `relay` tag and commit the new well-known file — the coordinate is unchanged, and so is every suggestion, since rule 6 is about the `a` root; the list gets a home not called *ephemeral* | Phase 9 |
| `curare-to/bitcoin.mov` | fold `docs/conventions.md` into `NIP.md` — the post group, the relay rule for comments and reactions, kind 10889, CORS on the well-known document — and put the NIP up for review | Phase 7 |
| `curated-kmp` | pull `vectors/` in as a git submodule (the app already consumes `lightning-kmp-app` that way) and have `CuratedSchemaEventTest` / `CuratedEntryEventTest` walk it, so a rule the two ports disagree on fails in both | Phase 0 |
| `curare-to/site-template` (new) | a smaller template than a fork of this repository: the single-list build with the directory code stripped out, for people who want a bitcoin.mov-shaped site and nothing else | Phase 6 |

## Appendix — what was considered and rejected

**NIP-72 as the base.** Kind 34550 communities with kind 4550 approvals are the
existing reddit-on-Nostr, and the two designs rhyme: definition ≈ schema,
post ≈ suggestion, approval ≈ canonical. Three things decided it. NIP-72
moderators are any of N pubkeys, one signature each, listed on the definition;
Curare's curator is one key, and a team is a k-of-N threshold behind it, which
is both stronger and invisible. NIP-72 posts are free text; a schema makes
a sub a catalogue when it wants to be (bitcoin.mov is one) and a link board
when it does not. And a kind 4550 approval embeds the post as-is, while a
canonical event is a copy the curator may correct — "a pointer could only say
yes". A *read* bridge — a kind 34550 shown as a sub with a fixed text-and-link
schema, its approved kind 1111 posts as canonical entries — is cheap and
belongs in a later note; a write bridge would mean signing 4550s, and it is not
planned.

**Kind 10004 for subscriptions.** Right meaning, wrong owner; decision 8.

**Rooting comments at the not-yet-existing canonical coordinate.** The
canonical address `31890:<curator>:<d>` is known the moment a suggestion is
made, so a thread could root there before the curator signs and never move.
NIP-22 wants an `e` beside an addressable parent and NIP-25 requires one
outright, and an address with no event has no id. Decision 4's group merge
gets the same single thread with every event well-formed.

**Post-moderation as the default.** Showing suggestions on the front page
until the curator objects would be reddit's default, and it would make the
one signed thing in the protocol optional. The *new* tab is the reader's
version of it; decision 3.

**A backend index as the source of truth.** It would make `r/all` and
second-hop web-of-trust trivial and would make the site depend on it. Phase 9's
relay is the same convenience with a standard interface and no privilege:
anyone can run one, the viewer can point at theirs, and nothing the site shows
is something a relay told it without a signature.

**Query-string routes** (`/r/?c=…`) as bitcoin.mov's `/video?…`. A 200 on
every host, and a URL nobody would paste. Pretty paths with the 404 shell, and
a `_redirects` line on a host that has one; Phase 1.

**A shared package now.** Extracting `curatedSchemaEvent.ts` into
`curare-to/protocol` first would give three implementations one definition
from day one — and would change bitcoin.mov's deploy and the app's tests
before a sub renders here. The plan keeps every change in this repository,
pays for it with a verbatim copy that is tested against the events
bitcoin.mov actually published, and lists the extraction first under *Future
work*; decision 9. (When it happens: a repository of its own rather than a
monorepo, because npm cannot install a subdirectory from git and the Kotlin
port wants a submodule path.)

**Second-hop web of trust.** Follows-of-follows means a kind 3 per follow,
hundreds of events for a viewer with a normal follow list, on every visit.
Worth doing from a cache — Phase 9's relay could serve a pre-joined answer —
and not before.

**Markdown in comments and bodies.** Reddit has it; a renderer that produces
elements rather than HTML strings (`skipHtml`, no images, safe `href`s only)
would not break the "never render as HTML" rule. A later note, after Phase 3
has shown what people actually write.

**A `coordinate` field type.** The curated directory (future work) would want
a first-class field type for a `kind:pubkey:d` instead of a `token` with a
pattern. It is a NIP change for one list; the pattern does the job until a
second list wants it.
