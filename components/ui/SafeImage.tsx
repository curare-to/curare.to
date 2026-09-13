'use client'

import { useState } from 'react'

/**
 * An <img> for a URL somebody else supplied: https only (checked by the
 * caller through isSafeUrl), and a placeholder when it fails to load, so a
 * dead poster link never leaves a broken-image icon on the page.
 */
export function SafeImage({
  src,
  className,
  placeholderClassName,
  alt = '',
}: {
  src: string | null
  className?: string
  placeholderClassName?: string
  alt?: string
}) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div className={placeholderClassName ?? className} aria-hidden="true">
        <span className="flex h-full w-full items-center justify-center text-3xl text-muted">▢</span>
      </div>
    )
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} loading="lazy" onError={() => setFailed(true)} />
}
