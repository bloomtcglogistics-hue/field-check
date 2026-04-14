// TCG Field Check — Service Worker v2.0
// Vite build output caching strategy: cache-first for assets, network-first for API

const CACHE_NAME = 'fieldcheck-v2'
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Never cache Supabase API calls
  if (url.hostname.endsWith('supabase.co')) return

  // For navigation requests: network-first, fallback to cached /
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/').then((r) => r || fetch('/'))
      )
    )
    return
  }

  // Cache-first for hashed Vite assets and fonts
  if (
    url.pathname.startsWith('/assets/') ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) => cached || fetch(event.request).then((res) => {
          const clone = res.clone()
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone))
          return res
        })
      )
    )
    return
  }

  // Default: network-first
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)))
})
