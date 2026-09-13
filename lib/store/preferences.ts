'use client'

import { useSyncExternalStore } from 'react'
import type { VoteMode } from '@/lib/rank/wot'
import type { SortKey } from '@/lib/rank/hot'

/* Per-viewer conveniences, in localStorage: which count to show, which sort to open on. */

export interface Preferences {
  votes: VoteMode
  sort: SortKey
}

const KEY = 'curare.to:preferences'
const DEFAULTS: Preferences = { votes: 'everyone', sort: 'hot' }

class PreferenceStore {
  private prefs: Preferences = DEFAULTS
  private loaded = false
  private listeners = new Set<() => void>()

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    this.load()
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): Preferences => this.prefs
  getServerSnapshot = (): Preferences => DEFAULTS

  private load(): void {
    if (this.loaded || typeof window === 'undefined') return
    this.loaded = true
    try {
      const raw = window.localStorage.getItem(KEY)
      if (raw) this.prefs = { ...DEFAULTS, ...JSON.parse(raw) }
    } catch {
      this.prefs = DEFAULTS
    }
  }

  set = (patch: Partial<Preferences>): void => {
    this.prefs = { ...this.prefs, ...patch }
    try {
      window.localStorage.setItem(KEY, JSON.stringify(this.prefs))
    } catch {
      // storage unavailable; the choice holds for this page
    }
    for (const listener of this.listeners) listener()
  }
}

export const preferences = new PreferenceStore()

export function usePreferences(): Preferences {
  return useSyncExternalStore(preferences.subscribe, preferences.getSnapshot, preferences.getServerSnapshot)
}
