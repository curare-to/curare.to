'use client'

import { useEffect, useState } from 'react'

export function timeAgo(seconds: number, now = Date.now() / 1000): string {
  const delta = Math.max(0, Math.floor(now - seconds))
  if (delta < 60) return 'just now'
  const minutes = Math.floor(delta / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

/** A relative time that re-renders on the client, with the absolute date on hover. */
export function TimeAgo({ seconds, className }: { seconds: number; className?: string }) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now() / 1000)
    const timer = setInterval(() => setNow(Date.now() / 1000), 60_000)
    return () => clearInterval(timer)
  }, [])
  const date = new Date(seconds * 1000)
  return (
    <time dateTime={date.toISOString()} title={date.toLocaleString()} className={className}>
      {now === null ? date.toLocaleDateString() : timeAgo(seconds, now)}
    </time>
  )
}
