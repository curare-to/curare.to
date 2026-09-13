import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { IndexedDbCache } from '@/lib/cache/eventCache'
import { signedBy } from './keys'

describe('IndexedDbCache', () => {
  it('stores events by scope and id, upserts, and knows the newest', async () => {
    const cache = new IndexedDbCache(indexedDB)
    const a = signedBy('a', { kind: 1, tags: [], content: 'a', created_at: 100 })
    const b = signedBy('b', { kind: 1, tags: [], content: 'b', created_at: 200 })
    await cache.save('list:x', [a, b])
    await cache.save('list:x', [a]) // again: no duplicate
    await cache.save('list:y', [b])
    expect((await cache.load('list:x')).map((e) => e.id).sort()).toEqual([a.id, b.id].sort())
    expect((await cache.load('list:y')).map((e) => e.id)).toEqual([b.id])
    expect(await cache.newest('list:x')).toBe(200)
    expect(await cache.newest('list:nothing')).toBeNull()
    await cache.clear()
    expect(await cache.load('list:x')).toEqual([])
  })
})
