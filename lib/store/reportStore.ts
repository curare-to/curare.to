'use client'

import { useMemo, useSyncExternalStore } from 'react'
import type { Event } from 'nostr-tools/pure'
import type { SimplePool } from 'nostr-tools/pool'
import { pool as defaultPool } from '@/lib/nostr/pool'
import { curatedSchemaAddress, type CuratedSchema } from '@/lib/protocol/curated'
import { parseReport, REPORT_KIND, type Report } from '@/lib/protocol/reports'

/* Reports on whatever the curator's queue shows, one store per sub, read by
 * event id in chunks from the sub's relays. */

const CHUNK = 60

export class ReportStore {
  readonly relays: string[]
  private readonly pool: Pick<SimplePool, 'subscribeMany'>
  private ids: string[] = []
  private subs: { close(): void }[] = []
  private reports = new Map<string, Report>()
  private listeners = new Set<() => void>()
  private version = 0
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(relays: string[], options: { pool?: Pick<SimplePool, 'subscribeMany'> } = {}) {
    this.relays = relays
    this.pool = options.pool ?? defaultPool
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) this.close()
    }
  }
  getSnapshot = (): number => this.version
  getServerSnapshot = (): number => 0

  watch(ids: string[]): void {
    const next = [...new Set([...this.ids, ...ids])]
    if (next.length === this.ids.length) return
    this.ids = next
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.reopen(), 200)
  }

  pushEvent = (event: Event): void => {
    const report = parseReport(event)
    if (!report || this.reports.has(report.id)) return
    this.reports.set(report.id, report)
    this.bump()
  }

  private reopen(): void {
    this.close()
    for (let i = 0; i < this.ids.length; i += CHUNK) {
      this.subs.push(
        this.pool.subscribeMany(this.relays, { kinds: [REPORT_KIND], '#e': this.ids.slice(i, i + CHUNK), limit: 1000 }, { onevent: this.pushEvent }),
      )
    }
  }

  close(): void {
    for (const sub of this.subs) sub.close()
    this.subs = []
  }

  private bump(): void {
    this.version += 1
    for (const listener of this.listeners) listener()
  }

  /** Reports on any of these ids, newest first. */
  reportsOn(ids: Iterable<string>): Report[] {
    const set = new Set(ids)
    return [...this.reports.values()].filter((r) => set.has(r.targetId)).sort((a, b) => b.createdAt - a.createdAt)
  }
}

const stores = new Map<string, ReportStore>()

export function getReportStore(schema: CuratedSchema, relays: string[]): ReportStore {
  const key = curatedSchemaAddress(schema) ?? schema.identifier
  let store = stores.get(key)
  if (!store) {
    store = new ReportStore(relays)
    stores.set(key, store)
  }
  return store
}

/** Watch reports on a set of ids; returns a lookup that recomputes as reports arrive. */
export function useReports(schema: CuratedSchema, relays: string[], ids: string[]): (ids: Iterable<string>) => Report[] {
  const store = getReportStore(schema, relays)
  store.watch(ids)
  const version = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (targets: Iterable<string>) => store.reportsOn(targets), [store, version])
}
