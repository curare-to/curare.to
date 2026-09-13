'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { nip19 } from 'nostr-tools'
import type { Event } from 'nostr-tools/pure'
import type { CuratedSchema } from '@/lib/protocol/curated'
import { buildMutesTemplate, MUTE_KIND } from '@/lib/protocol/mutes'
import { Nip07Error, signAndPublish } from '@/lib/nostr/nip07'
import { pool } from '@/lib/nostr/pool'
import { directoryRelays } from '@/lib/nostr/relays'
import { muteStore, useMutes } from '@/lib/store/muteStore'
import { useSession } from '@/lib/store/session'
import { parsePubkey } from '@/lib/routes'
import { ProfileName } from '@/components/ui/ProfileName'

/**
 * The curator's bans: their ordinary kind 10000 mute list, edited here and
 * honoured by every client. Public pubkeys and words are shown and edited;
 * the encrypted part, if any, is carried over untouched.
 */
export function BannedTab({ schema, relays }: { schema: CuratedSchema; relays: string[] }) {
  const session = useSession()
  const mutes = useMutes(schema.namespace)
  const curator = session.pubkey === schema.namespace
  const [previous, setPrevious] = useState<Event | null>(null)
  const [pubkeyText, setPubkeyText] = useState('')
  const [wordText, setWordText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The last published list, for its encrypted content.
  useEffect(() => {
    let cancelled = false
    pool
      .querySync([...new Set([...directoryRelays(), ...relays])], { kinds: [MUTE_KIND], authors: [schema.namespace] })
      .then((events) => {
        if (cancelled) return
        setPrevious(events.sort((a, b) => b.created_at - a.created_at || (a.id < b.id ? -1 : 1))[0] ?? null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [schema.namespace, relays])

  async function publish(pubkeys: Iterable<string>, words: Iterable<string>) {
    setError(null)
    setBusy(true)
    try {
      // Replaceable events resolve by timestamp: two edits in one second must not tie.
      const createdAt = Math.max(Math.floor(Date.now() / 1000), (previous?.created_at ?? 0) + 1)
      const template = buildMutesTemplate({ pubkeys, words, previous, createdAt })
      const { signed } = await signAndPublish(template, [...new Set([...relays, ...directoryRelays(), ...session.writeRelays])])
      setPrevious(signed)
      await muteStore.push(signed)
    } catch (err) {
      setError(err instanceof Nip07Error ? err.message : 'Could not publish the list.')
    } finally {
      setBusy(false)
    }
  }

  const addPubkey = (e: FormEvent) => {
    e.preventDefault()
    const pk = parsePubkey(pubkeyText)
    if (!pk) {
      setError('That is not an npub.')
      return
    }
    setPubkeyText('')
    void publish([...mutes.pubkeys, pk], mutes.words)
  }
  const addWord = (e: FormEvent) => {
    e.preventDefault()
    const w = wordText.trim().toLowerCase()
    if (!w) return
    setWordText('')
    void publish(mutes.pubkeys, [...mutes.words, w])
  }

  return (
    <div className="space-y-6 text-sm">
      <p className="text-muted">
        The curator&apos;s mute list, applied inside this list: a muted key&apos;s suggestions leave the queue and its comments fold; a muted word hides matching
        titles. It is the curator&apos;s ordinary kind 10000, so other clients honour it too.
        {mutes.privateUnreadable ? ' It also has private entries this extension cannot show; they are kept as they are.' : ''}
      </p>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Banned keys ({mutes.pubkeys.size})</h2>
        <ul className="space-y-1">
          {[...mutes.pubkeys].map((pk) => (
            <li key={pk} className="flex flex-wrap items-center gap-2">
              <ProfileName pubkey={pk} />
              <span className="font-mono text-xs text-muted">{nip19.npubEncode(pk).slice(0, 20)}…</span>
              {curator ? (
                <button type="button" disabled={busy} onClick={() => void publish([...mutes.pubkeys].filter((p) => p !== pk), mutes.words)} className="text-xs text-muted hover:text-danger disabled:opacity-50">
                  unban
                </button>
              ) : null}
            </li>
          ))}
          {mutes.pubkeys.size === 0 ? <li className="text-muted">Nobody.</li> : null}
        </ul>
        {curator ? (
          <form onSubmit={addPubkey} className="mt-2 flex flex-wrap gap-2">
            <input value={pubkeyText} onChange={(e) => setPubkeyText(e.target.value)} placeholder="npub1…" aria-label="Key to ban" className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-1.5 font-mono text-xs focus:border-accent focus:outline-none" />
            <button type="submit" disabled={busy} className="rounded-md border border-line px-3 py-1.5 hover:border-line-strong disabled:opacity-50">
              {busy ? 'Signing…' : 'Ban'}
            </button>
          </form>
        ) : null}
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Muted words ({mutes.words.length})</h2>
        <ul className="flex flex-wrap gap-2">
          {mutes.words.map((w) => (
            <li key={w} className="rounded-full border border-line px-2.5 py-0.5 text-xs">
              {w}
              {curator ? (
                <button type="button" disabled={busy} onClick={() => void publish(mutes.pubkeys, mutes.words.filter((x) => x !== w))} className="ml-1 text-muted hover:text-danger disabled:opacity-50" aria-label={`Unmute ${w}`}>
                  ✕
                </button>
              ) : null}
            </li>
          ))}
          {mutes.words.length === 0 ? <li className="text-muted">None.</li> : null}
        </ul>
        {curator ? (
          <form onSubmit={addWord} className="mt-2 flex flex-wrap gap-2">
            <input value={wordText} onChange={(e) => setWordText(e.target.value)} placeholder="a word" aria-label="Word to mute" className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm focus:border-accent focus:outline-none" />
            <button type="submit" disabled={busy} className="rounded-md border border-line px-3 py-1.5 hover:border-line-strong disabled:opacity-50">
              {busy ? 'Signing…' : 'Mute word'}
            </button>
          </form>
        ) : null}
      </section>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  )
}
