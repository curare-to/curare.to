# relay.curare.to

A strfry relay that holds exactly what the site speaks, and syncs it from
every relay the lists it knows about name. It is a cache, not an authority:
the site's directory-relay list is a setting the viewer can edit, any list
may add this relay to its `relay` tags, and if it goes away the site is
slower, not broken. Everything needed to run one is in this directory, so
"anyone can run one" is a command and not a promise.

| file | what |
|---|---|
| `strfry.conf` | the relay's configuration: limits, and the write policy below |
| `policy.mjs` | the write policy: accepts kinds `0 3 5 7 1111 1984 1985 10000 10002 10889 31888 31889 31890`, refuses everything else, caps sizes, refuses events from the future |
| `sync.mjs` | the negentropy sync (NIP-77, `strfry sync`): reads every kind 31889 the relay holds, collects their `relay` tags, and pulls those kinds down from each |
| `docker-compose.yml` | strfry with the config and policy mounted, and the data volume |
| `sync.timer`, `sync.service` | a systemd timer that runs the sync every fifteen minutes |

## Run it

```bash
cd relay
docker compose up -d
```

strfry listens on `127.0.0.1:7777`; put a TLS-terminating proxy (Caddy,
nginx) in front of it for `wss://relay.curare.to`. The `Access-Control-*`
headers are not needed — websockets are not subject to CORS — but the NIP-11
document is: strfry serves it from `strfry.conf`'s `relay.info` block when a
client asks with `Accept: application/nostr+json`, and the site reads it to
learn whether NIP-45 counts are supported (they are).

## Sync

```bash
node relay/sync.mjs                      # once, against the running container
node relay/sync.mjs --dry-run            # which relays and filters it would use
```

Install the timer to run it on a schedule:

```bash
sudo cp relay/sync.service relay/sync.timer /etc/systemd/system/
sudo systemctl enable --now sync.timer
```

The sync is one-directional: it pulls into this relay and never pushes.
Lists still publish to the relays their schemas name; this relay learns of a
list the first time someone publishes its schema here, or the first time the
sync sees it on a relay it already follows.

## Why these kinds

`31889 31888 31890` are the protocol. `1111` comments, `7` votes, `1984`
reports and `1985` labels attach to posts (docs/conventions.md). `0` and `3`
are profiles and follow lists, which the site shows and weighs votes by.
`10000` mute lists are bans, `10002` write relays are where copies go,
`10889` are subscriptions. `5` deletions undo labels. Nothing else has a
reader here, so nothing else is stored.
