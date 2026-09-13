Conventions around curated lists
================================

`draft` `optional`

This document is the section the curated-lists NIP (bitcoin.mov,
[`docs/NIP.md`](https://github.com/curare-to/bitcoin.mov/blob/bitcoin.mov/docs/NIP.md))
does not have and a reddit-shaped client needs: how the standard kinds that
carry comments, reactions, reports, labels and subscriptions **address an
entry** in a curated list, and where they are published. It adds nothing to
the shape of the three kinds — `31889` schema, `31888` suggestion, `31890`
canonical — and it is written in the NIP's register so that it can be folded
into that document later as an edit rather than a rewrite.

The words MUST, SHOULD and MAY are used as in the NIP.

## The post group

An entry in a list is identified by its `d` under the list's schema. Several
pubkeys MAY suggest the same subject and share a `d`; the curator's canonical
event carries that `d` too and MAY name one of them as its source. A client
SHOULD treat the whole set as **one post**:

```
group(schema, d) =
    { 31890:<curator>:<d> }                                the canonical entry, whether or not it exists yet
  ∪ { 31888:<p>:<d>  for every valid suggestion of d }     every version anyone proposed
  ∪ { the coordinate the canonical's 31888: `a` tag names } the source, even when its d differs
```

The **head** of the group is the canonical event when there is one, else the
newest suggestion. The head is what a client displays; the other members are
its versions.

Everything attached to a post — comments, reactions, reports, labels — is
attached to a **member** of the group (a real event, with an id and a
coordinate), and read back for the **whole group** by querying every
coordinate in it at once. A discussion that started while a post sat in the
queue is the same discussion after it is curated; a link two people submitted
has one thread and one score.

## Relays

The NIP requires suggestions and canonical events to be published to the
schema's `relay` tags. The same rule applies to everything this document
attaches to a post: a client MUST publish comments, reactions, reports and
labels for an entry to the schema's `relay` tags when there are any, and
SHOULD read them from there. A reader who has the schema then knows where to
find all of it, and a list that names one durable relay is complete on that
relay.

A client MAY additionally publish to the author's own write relays (NIP-65,
kind `10002`) so that the author's activity is visible from their profile on
other clients. Nothing is read from there.

## Comments — NIP-22, kind `1111`

A comment on a post is a NIP-22 comment whose root scope is the group's head.
For a top-level comment on a canonical entry:

```jsonc
{
  "kind": 1111,
  "content": "…",
  "tags": [
    ["A", "31890:<curator>:<d>", "<relay>"],   // root: the head's coordinate
    ["K", "31890"],
    ["P", "<curator>", "<relay>"],
    ["a", "31890:<curator>:<d>", "<relay>"],   // parent: the same, for a top-level comment
    ["e", "<head event id>", "<relay>"],       // NIP-22: an addressable parent also carries its id
    ["k", "31890"],
    ["p", "<curator>", "<relay>"]
  ]
}
```

On a post still in the queue the head is a suggestion, so `A`/`a` are
`31888:<suggester>:<d>`, `K`/`k` are `31888`, and `P`/`p` name the suggester.
A reply to a comment keeps the root tags and points `e` / `k: 1111` / `p` at
the parent comment, as NIP-22 describes.

A client reads a post's thread with the group's coordinates as one filter:

```jsonc
{"kinds":[1111],"#A":[…every coordinate in the group…]}
```

and MUST render comment content as text, never as HTML.

## Reactions — NIP-25, kind `7`

A vote is a NIP-25 reaction on the version of the post the voter is looking
at. Per NIP-25 the `e` tag is required, and the `a` tag SHOULD be included
for an addressable event:

```jsonc
{
  "kind": 7,
  "content": "+",                                // "-" for a downvote
  "tags": [
    ["e", "<event id>", "<relay>"],
    ["a", "31890:<curator>:<d>", "<relay>"],
    ["p", "<author of that event>"],
    ["k", "31890"]
  ]
}
```

A client reads a post's reactions with `{"kinds":[7],"#a":[…the group…]}`.
It SHOULD count at most one vote per pubkey per group, the newest reaction by
that pubkey winning, so that changing a vote is publishing again. `+` and the
empty string count as an upvote and `-` as a downvote, as NIP-25 says; any
other content counts for nothing.

There is no total. A score is one client's count of the reactions it fetched
from the relays it read, weighted as its viewer chose, and a client SHOULD
say so where it shows one.

## Reports — NIP-56, kind `1984`

A report on a post or comment is a NIP-56 report naming the event on screen
with `e` (the report type as the tag's third element) and its author with
`p`. NIP-56 has no `a` tag, so a client reads a post's reports with the ids of
every event in the group:

```jsonc
{"kinds":[1984],"#e":[…every event id in the group…]}
```

Reports are for the curator. A client SHOULD show them in the curator's queue
and SHOULD NOT show them to anyone else.

## Rejection — NIP-32, kind `1985`

A curator who declines a suggestion MAY say so with a label, so that queues
can hide it and the suggester can see why:

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

Only a label signed by the schema's `pubkey` counts. A client reads a list's
rejections with `{"kinds":[1985],"authors":["<curator>"],"#L":["curare.to"]}`,
and SHOULD hide a rejected suggestion from the queue by default while still
showing it to its author. A rejection is undone by curating the entry after
all, or by a kind `5` deletion of the label.

## Bans — NIP-51, kind `10000`

The curator's own mute list applies inside their list: a client SHOULD hide
suggestions and comments by a muted pubkey from the list's queue and threads,
and SHOULD hide entries whose title matches a `word` entry. No new event is
needed; it is the curator's ordinary mute list, so other clients honour it
too.

## Subscriptions — kind `10889` (provisional)

A pubkey's subscribed lists are a NIP-51-shaped replaceable list of `a` tags
naming schema coordinates, with private items NIP-44-encrypted in `.content`
as NIP-51 describes:

```jsonc
{
  "kind": 10889,
  "tags": [["a", "31889:<curator>:<d>", "<relay>"], …],
  "content": "<NIP-44 of the same array, for private subscriptions>"
}
```

NIP-51's kind `10004` (*Communities*) is defined for kind `34550`
coordinates, and a client that rebuilds a user's community list from its own
model would drop entries it does not understand. A kind of the family's own
avoids that. The number is provisional until the NIP is submitted for
review, and a client SHOULD treat it as such.

## Serving the schema to other origins

A site that serves its signed schema at `/.well-known/curare.to/nostr.json`
SHOULD serve it with permissive CORS (`Access-Control-Allow-Origin: *`), so
that a client on another origin — a directory, another list's site — can
fetch it and verify it. GitHub Pages does this by default; a site hosted
elsewhere has to arrange it. The file holds only public, signed data, and the
signature is what a reader trusts; the header only lets the reader get that
far.
