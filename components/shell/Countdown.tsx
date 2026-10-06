'use client'

import { useEffect, useState } from 'react'
import { COUNTDOWN_TARGET, COUNTDOWN_WHEN, remainingUntil } from '@/lib/countdown'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
const TARGET = Date.parse(COUNTDOWN_TARGET)

/**
 * The home page until the moment lib/countdown.ts names: the time left,
 * to the second, and the moment in the viewer's own time zone. The clock is
 * read only after mount — the export is prerendered, and its HTML must not
 * carry the build's idea of now. Once the moment has passed the page gives
 * way to /landing/, where the feed lives: it replaces itself there rather
 * than pushing, so Back does not land on a countdown that has run out. The
 * way in stays written on the page for whoever the redirect does not carry.
 */
export function Countdown() {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = () => {
      const t = Date.now()
      setNow(t)
      if (t < TARGET) {
        // Wake on the next whole second, so the display flips as the clock does.
        timer = setTimeout(tick, 1000 - (t % 1000))
      } else {
        // The moment has come, by arriving after it or by sitting here as it
        // passed: go in. No further tick is scheduled, so this fires once.
        window.location.replace(`${BASE}/landing/`)
      }
    }
    tick()
    return () => clearTimeout(timer)
  }, [])

  const left = now === null ? null : remainingUntil(TARGET, now)
  const reached = left?.reached ?? false
  const parts: [string, number | undefined][] = [
    ['days', left?.days],
    ['hours', left?.hours],
    ['minutes', left?.minutes],
    ['seconds', left?.seconds],
  ]

  return (
    <div className="flex flex-col items-center text-center">
      <h1 className="text-xs font-semibold uppercase tracking-wide text-muted">
        {reached ? (
          'It’s time.'
        ) : (
          <time dateTime={COUNTDOWN_TARGET}>
            {COUNTDOWN_WHEN.date} · {COUNTDOWN_WHEN.time}
          </time>
        )}
      </h1>
      <div
        role="timer"
        aria-label={`Time left until ${COUNTDOWN_WHEN.date}, ${COUNTDOWN_WHEN.time}`}
        className="mt-8 grid grid-cols-4 gap-4 sm:gap-10"
      >
        {parts.map(([label, value]) => (
          <div key={label} className="min-w-[2ch]">
            <div className="text-5xl font-semibold tabular-nums tracking-tight sm:text-7xl">
              {value === undefined ? <span aria-hidden="true">––</span> : String(value).padStart(2, '0')}
            </div>
            <div className="mt-2 text-xs uppercase tracking-wide text-muted">{label}</div>
          </div>
        ))}
      </div>
      {now === null ? null : reached ? (
        <p className="mt-10 text-sm text-muted">
          Taking you in…{' '}
          <a href={`${BASE}/landing/`} className="text-accent underline hover:text-accent-ink">
            Come in
          </a>
        </p>
      ) : (
        <p className="mt-10 text-sm text-muted">
          That is{' '}
          <time dateTime={COUNTDOWN_TARGET}>
            {new Date(TARGET).toLocaleString(undefined, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              hour: 'numeric',
              minute: '2-digit',
              timeZoneName: 'short',
            })}
          </time>{' '}
          where you are.
        </p>
      )}
    </div>
  )
}
