/* curare.to service worker: the export loads from this device once it has
 * been seen, and the relays are the only network. Hashed build assets are
 * cached on first use and never refetched; pages are fetched from the
 * network first and fall back to the last copy when there is none. Nothing
 * from another origin is cached — posters and profile pictures come and go
 * with the entries that carry them. */

const VERSION = 'curare-to-v1'
const PAGES = `${VERSION}-pages`
const ASSETS = `${VERSION}-assets`

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== PAGES && key !== ASSETS).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (url.pathname.includes('/_next/static/')) {
    event.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const cached = await cache.match(request)
        if (cached) return cached
        const response = await fetch(request)
        if (response.ok) cache.put(request, response.clone())
        return response
      }),
    )
    return
  }

  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          // A 404 is the shell for /r/… and /u/…; worth keeping too.
          if (response.ok || response.status === 404) {
            const cache = await caches.open(PAGES)
            cache.put(request, response.clone())
          }
          return response
        })
        .catch(async () => {
          const cache = await caches.open(PAGES)
          return (await cache.match(request)) || (await cache.match('/404.html')) || Response.error()
        }),
    )
  }
})
