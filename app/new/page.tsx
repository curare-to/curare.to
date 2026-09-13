import { Suspense } from 'react'
import type { Metadata } from 'next'
import { SchemaEditorPage } from '@/components/schema/SchemaEditor'

export const metadata: Metadata = {
  title: 'New list',
  description: 'Start a curated list: choose what a post may contain, who may suggest, and where it lives. Signed with your key.',
}

export default function NewList() {
  return (
    <Suspense fallback={<p className="py-16 text-center text-muted">Loading…</p>}>
      <SchemaEditorPage />
    </Suspense>
  )
}
