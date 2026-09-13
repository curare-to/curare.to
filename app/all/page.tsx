import type { Metadata } from 'next'
import { DirectoryList } from '@/components/directory/DirectoryList'
import { OpenList } from '@/components/shell/OpenList'

export const metadata: Metadata = {
  title: 'All lists',
  description: 'Every curated list the directory relays hold, verified and shown under its curator.',
}

export default function AllPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">All lists</h1>
      <div className="mt-4">
        <OpenList />
      </div>
      <div className="mt-6">
        <DirectoryList />
      </div>
    </div>
  )
}
