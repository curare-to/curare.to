import { describe, expect, it } from 'vitest'
import { COUNTDOWN_TARGET, remainingUntil } from '@/lib/countdown'

const TARGET = Date.parse(COUNTDOWN_TARGET)

describe('countdown', () => {
  it('counts down to Friday 18 September 2026, 21:21 UTC', () => {
    const d = new Date(TARGET)
    expect(d.getUTCDay()).toBe(5)
    expect(d.toISOString()).toBe('2026-09-18T21:21:00.000Z')
  })

  it('splits what is left into whole days, hours, minutes and seconds', () => {
    const now = Date.UTC(2026, 8, 14, 9, 0, 30)
    expect(remainingUntil(TARGET, now)).toEqual({ days: 4, hours: 12, minutes: 20, seconds: 30, reached: false })
    expect(remainingUntil(TARGET, TARGET - 1000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 1, reached: false })
  })

  it('rounds a fraction of a second down, never up to a second that has not passed', () => {
    expect(remainingUntil(TARGET, TARGET - 1500).seconds).toBe(1)
    expect(remainingUntil(TARGET, TARGET - 999).seconds).toBe(0)
    expect(remainingUntil(TARGET, TARGET - 999).reached).toBe(false)
  })

  it('is all zeros and reached at the moment and after it', () => {
    expect(remainingUntil(TARGET, TARGET)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, reached: true })
    expect(remainingUntil(TARGET, TARGET + 86_400_000 * 3)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, reached: true })
  })
})
