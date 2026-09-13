import { Suspense } from 'react'
import type { Metadata } from 'next'
import { SubmitPage } from '@/components/entry/SubmitPage'

export const metadata: Metadata = {
  title: 'Suggest',
  description: 'Suggest an entry to a curated list. Signed in your extension, published to the relays the list names.',
}

export default function Submit() {
  return (
    <Suspense fallback={<p className="py-16 text-center text-muted">Loading…</p>}>
      <SubmitPage />
    </Suspense>
  )
}
