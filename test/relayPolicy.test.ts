import { describe, expect, it } from 'vitest'
// The relay's write policy and sync helper are plain modules, tested here so
// that the kinds they name stay the kinds the site speaks.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — an .mjs without types
import { judge } from '../relay/policy.mjs'
// @ts-ignore
import { relaysFrom } from '../relay/sync.mjs'

describe('relay write policy', () => {
  const now = 1_760_000_000
  const event = (patch: Record<string, unknown>) => ({ id: 'x', kind: 1111, content: 'hi', tags: [], created_at: now, ...patch })

  it('accepts exactly the kinds the site speaks', () => {
    for (const kind of [0, 3, 5, 7, 1111, 1984, 1985, 10000, 10002, 10889, 31888, 31889, 31890]) {
      expect(judge(event({ kind, content: kind === 3 ? '' : 'x' }), now).action, `kind ${kind}`).toBe('accept')
    }
    for (const kind of [1, 4, 30023, 34550, 4550, 9735]) {
      expect(judge(event({ kind }), now).action, `kind ${kind}`).toBe('reject')
    }
  })

  it('caps content by kind and refuses the future', () => {
    expect(judge(event({ kind: 7, content: '+'.repeat(65) }), now).msg).toMatch(/over 64 bytes/)
    expect(judge(event({ kind: 1111, content: 'x'.repeat(16_385) }), now).action).toBe('reject')
    expect(judge(event({ kind: 1111, content: 'x'.repeat(16_384) }), now).action).toBe('accept')
    expect(judge(event({ created_at: now + 901 }), now).msg).toMatch(/future/)
    expect(judge(event({ created_at: now + 899 }), now).action).toBe('accept')
  })
})

describe('sync relays', () => {
  it('collects every relay the schemas name, plus the seeds, once each', () => {
    const lines = [
      JSON.stringify({ kind: 31889, tags: [['relay', 'wss://a.example'], ['relay', 'wss://b.example']] }),
      JSON.stringify({ kind: 31889, tags: [['relay', 'wss://b.example'], ['relay', 'not a relay']] }),
      'not json',
      '',
    ]
    expect(relaysFrom(lines, ['wss://seed.example'])).toEqual(['wss://seed.example', 'wss://a.example', 'wss://b.example'])
  })
})
