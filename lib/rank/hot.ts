/* ------------------------------------------------------------------ *
 * Ranking, computed by the viewer from what this page fetched. Nothing
 * needs a server because nothing needs a total.
 * ------------------------------------------------------------------ */

/** Reddit's epoch: 2005-12-08 07:46:43 UTC. */
export const HOT_EPOCH = 1_134_028_003

/**
 * Reddit's hot: sign(s)·log10(max(|s|,1)) + t/45000. Ten votes buy about
 * 12.5 hours; a hundred, a day.
 */
export function hot(score: number, createdAt: number): number {
  const order = Math.log10(Math.max(Math.abs(score), 1))
  const sign = score > 0 ? 1 : score < 0 ? -1 : 0
  return sign * order + (createdAt - HOT_EPOCH) / 45000
}

/**
 * The lower bound of the Wilson score interval at 95%: the confidence-
 * adjusted fraction of upvotes, which is what "best" means for a comment
 * with few votes against one with many.
 */
export function wilson(up: number, down: number, z = 1.96): number {
  const n = up + down
  if (n === 0) return 0
  const p = up / n
  const z2 = z * z
  return (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / (1 + z2 / n)
}

export type SortKey = 'hot' | 'new' | 'top' | 'sats'

export const SORTS: { key: SortKey; label: string; hint: string }[] = [
  { key: 'hot', label: 'Hot', hint: 'Votes against age, the way reddit ranks.' },
  { key: 'new', label: 'New', hint: 'Newest first.' },
  { key: 'top', label: 'Top', hint: 'Highest score first.' },
  { key: 'sats', label: 'Sats', hint: 'Most zapped first — the one number that is hard to fake.' },
]

export interface Rankable {
  createdAt: number
  score: number
  sats: number
  id: string
}

export function compareBy(sort: SortKey): (a: Rankable, b: Rankable) => number {
  const tie = (a: Rankable, b: Rankable) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1)
  switch (sort) {
    case 'hot':
      return (a, b) => hot(b.score, b.createdAt) - hot(a.score, a.createdAt) || tie(a, b)
    case 'top':
      return (a, b) => b.score - a.score || tie(a, b)
    case 'sats':
      return (a, b) => b.sats - a.sats || b.score - a.score || tie(a, b)
    case 'new':
      return tie
  }
}
