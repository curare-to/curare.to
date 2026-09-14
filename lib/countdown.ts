/**
 * The moment the home page counts down to: Friday 18 September 2026 at
 * 21:21 UTC. One constant, so moving the moment is a one-line change.
 */
export const COUNTDOWN_TARGET = '2026-09-18T21:21:00Z'

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
