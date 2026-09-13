'use client'

import { useState } from 'react'
import type { Event } from 'nostr-tools/pure'
import { buildReactionTemplate, type Direction, type Tally } from '@/lib/protocol/reactions'
import { shownScore } from '@/lib/rank/wot'
import { Nip07Error, signAndPublish } from '@/lib/nostr/nip07'
import { sessionStore, useSession } from '@/lib/store/session'
import type { Weighting } from '@/lib/store/useWeighting'

/**
 * ▲ number ▼. The number is the viewer's count under their mode, and the
 * hover says which count it is and what the other would be. A click signs a
 * NIP-25 reaction on `target` — the version on screen — and pushes it in.
 */
export function VoteButtons({
  target,
  tally,
  weighting,
  relays,
  writeRelays,
  onVoted,
  compact,
}: {
  target: Event
  tally: Tally
  weighting: Weighting
  relays: string[]
  writeRelays: string[]
  onVoted: (event: Event) => void
  compact?: boolean
}) {
  const session = useSession()
  const [busy, setBusy] = useState<Direction | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Timestamps are seconds, and the newest reaction per pubkey wins: a change
  // of mind within the same second has to be stamped a second later.
  const [lastVoteAt, setLastVoteAt] = useState(0)
  const score = shownScore(tally, weighting.mode)

  const title =
    `${tally.up} up, ${tally.down} down` +
    (weighting.mode === 'everyone'
      ? ` — everyone. Trusted would show ${Math.round(tally.weighted * 10) / 10} (${tally.trusted} from keys ${weighting.trustedFrom === 'you' ? 'you follow' : 'the curator follows'}).`
      : ` — weighted by keys ${weighting.trustedFrom === 'you' ? 'you follow' : 'the curator follows'}: ${tally.trusted} trusted voters. Everyone would show ${tally.score}.`) +
    (tally.sats > 0 ? ` ${tally.sats} sats zapped.` : '')

  async function vote(direction: Direction) {
    setError(null)
    const pubkey = session.pubkey ?? (await sessionStore.signIn())
    if (!pubkey) {
      setError('Sign in to vote.')
      return
    }
    setBusy(direction)
    try {
      const createdAt = Math.max(Math.floor(Date.now() / 1000), lastVoteAt + 1)
      const template = buildReactionTemplate({ target, direction, relay: relays[0], createdAt })
      const { signed } = await signAndPublish(template, [...new Set([...relays, ...writeRelays])])
      setLastVoteAt(createdAt)
      onVoted(signed)
    } catch (err) {
      setError(err instanceof Nip07Error ? err.message : 'Could not publish the vote.')
    } finally {
      setBusy(null)
    }
  }

  const button = (direction: Direction) => {
    const active = tally.mine === direction
    return (
      <button
        type="button"
        onClick={() => vote(direction)}
        disabled={busy !== null}
        aria-label={direction === 'up' ? 'Upvote' : 'Downvote'}
        aria-pressed={active}
        className={`rounded px-1 leading-none hover:bg-surface-2 disabled:opacity-50 ${active ? 'text-accent' : 'text-muted'}`}
      >
        {direction === 'up' ? '▲' : '▼'}
      </button>
    )
  }

  return (
    <div className={`flex ${compact ? 'flex-row items-center gap-1' : 'flex-col items-center'} text-sm`} title={title}>
      {button('up')}
      <span className={`font-medium tabular-nums ${tally.mine ? 'text-accent' : 'text-ink'}`} aria-label={`Score ${score}`}>
        {score}
      </span>
      {button('down')}
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
  )
}
