'use client'

import { RouterProvider, useRoute } from '@/lib/router'
import { ListPage, Notice } from '@/components/list/ListPage'
import { UserPage } from '@/components/user/UserPage'

/**
 * What app/not-found.tsx mounts: the client router over window.location,
 * and the page for whatever it finds there. A path that is neither a sub
 * nor a person is a real not-found.
 */
export function Shell() {
  return (
    <RouterProvider>
      <Routed />
    </RouterProvider>
  )
}

function Routed() {
  const route = useRoute()
  if (route === null) return <div className="mx-auto max-w-5xl px-4 py-16 text-muted">Loading…</div>
  switch (route.kind) {
    case 'list':
      return <ListPage list={route.list} tab={route.tab} />
    case 'entry':
      return <ListPage list={route.list} tab="front" entry={route.entry} />
    case 'user':
      return <UserPage pubkey={route.pubkey} />
    case 'home':
      // The static home page exists; only a broken deploy would route here.
      return <Notice title="Home" body="This page should be served statically." />
    case 'unknown':
      return (
        <Notice
          title="Not found"
          body="There is nothing at this address."
          hint="A list lives at /r/<npub>/<identifier>/ or /r/<domain>/, and a person at /u/<npub>/."
        />
      )
  }
}
