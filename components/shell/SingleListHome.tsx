'use client'

import { useSearchParams } from 'next/navigation'
import { ListPage } from '@/components/list/ListPage'
import type { ListTab } from '@/lib/routes'

/**
 * The single-list build: this site is one list, the one its well-known
 * document names — bitcoin.mov's model — and the home page is its front
 * page. NEXT_PUBLIC_SINGLE_LIST is the document's path or URL.
 */
export function SingleListHome({ url }: { url: string }) {
  const params = useSearchParams()
  const tab: ListTab = params.get('tab') === 'new' ? 'new' : params.get('tab') === 'queue' ? 'queue' : 'front'
  return <ListPage list={{ by: 'wellknown', url }} tab={tab} />
}
