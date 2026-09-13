import type { Event, EventTemplate } from 'nostr-tools/pure'

/* NIP-56 — kind 1984 — a report to the curator (docs/conventions.md). It names
 * the version on screen with `e` (the type as the third element) and its
 * author with `p`; NIP-56 has no `a`, so the mod view reads reports with the
 * ids of every event in the group. Reports are for the curator: shown in the
 * queue, never to anyone else. */

export const REPORT_KIND = 1984

export const REPORT_TYPES = ['spam', 'illegal', 'nudity', 'malware', 'profanity', 'impersonation', 'other'] as const
export type ReportType = (typeof REPORT_TYPES)[number]

export interface Report {
  id: string
  pubkey: string
  createdAt: number
  targetId: string
  targetPubkey: string
  type: ReportType
  reason: string
}

export function buildReportTemplate(options: { target: Pick<Event, 'id' | 'pubkey'>; type: ReportType; reason?: string; createdAt?: number }): EventTemplate {
  return {
    kind: REPORT_KIND,
    tags: [
      ['e', options.target.id, options.type],
      ['p', options.target.pubkey, options.type],
    ],
    content: (options.reason ?? '').trim(),
    created_at: options.createdAt ?? Math.floor(Date.now() / 1000),
  }
}

export function parseReport(event: Event): Report | null {
  if (event.kind !== REPORT_KIND) return null
  const e = event.tags.find((t) => t[0] === 'e' && typeof t[1] === 'string')
  const p = event.tags.find((t) => t[0] === 'p' && typeof t[1] === 'string')
  if (!e || !p) return null
  const type = (REPORT_TYPES as readonly string[]).includes(e[2] ?? '') ? (e[2] as ReportType) : (REPORT_TYPES as readonly string[]).includes(p[2] ?? '') ? (p[2] as ReportType) : 'other'
  return { id: event.id, pubkey: event.pubkey, createdAt: event.created_at, targetId: e[1], targetPubkey: p[1], type, reason: event.content.trim() }
}
