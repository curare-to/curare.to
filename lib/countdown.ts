/**
 * The moment the home page counts down to, and how the page spells it.
 * Moving it is a change here and to the test that pins it; the page and
 * the e2e spec follow. test/countdown.test.ts keeps the spelling true.
 */
export const COUNTDOWN_TARGET = '2026-10-08T21:21:00Z'
export const COUNTDOWN_WHEN = { date: 'Thursday 8 October 2026', time: '21:21 UTC' }

export interface Remaining {
  days: number
  hours: number
  minutes: number
  seconds: number
  /** True once `now` is at or past the target; every part is then zero. */
  reached: boolean
}

/** Whole days, hours, minutes and seconds from `now` to `target`, both in milliseconds since the epoch. */
export function remainingUntil(target: number, now: number): Remaining {
  const total = Math.max(0, Math.floor((target - now) / 1000))
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
    reached: now >= target,
  }
}
