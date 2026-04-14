// TCG Field Check — Service Worker v3.1
// Offline-first: cache shell, network-only for Supabase API

const CACHE_NAME = 'tcg-fieldcheck-v3-1'
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-192-maskable.png',
  '/icon-512-maskable.png',
]

// ── Message: activate a new SW immediately when the app asks ─────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] SKIP_WAITING received — activating new worker')
    self.skipWaiting()
  }
})

// ── Install: precache app shell ───────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // addAll fails if any resource 404s — use individual adds to be resilient
      return Promise.allSettled(
        APP_SHELL.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Could not precache:', url, err))
        )
      )
    })
  )
  self.skipWaiting()
})

// ── Activate: delete old caches ───────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => {
            console.log('[SW] Deleting old cache:', k)
            return caches.delete(k)
          })
      )
    )
  )
  self.clients.claim()
})

// ── Fetch: per-resource strategies ───────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Never intercept WebSocket connections (Supabase Realtime)
  if (event.request.url.startsWith('wss://')) return

  // Network-only: Supabase API calls — IndexedDB handles offline data
  if (url.hostname.endsWith('supabase.co')) return

  // Navigation requests: network-first, fall back to cached /index.html.
  // On success, update the cached shell so the next offline boot is fresh.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((res) => {
        const clone = res.clone()
        caches.open(CACHE_NAME).then((cache) => {
          cache.put('/index.html', clone).catch(() => { /* ignore quota errors */ })
        })
        return res
      }).catch(() =>
        caches.match('/index.html').then((r) => r || caches.match('/'))
      )
    )
    return
  }

  // Google Fonts: cache-first with background network update
  if (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          const networkFetch = fetch(event.request).then((res) => {
            cache.put(event.request, res.clone())
            return res
          }).catch(() => cached)
          return cached || networkFetch
        })
      )
    )
    return
  }

  // Same-origin static assets (Vite hashed JS/CSS/images/fonts): cache-first
  if (
    url.origin === self.location.origin && (
      url.pathname.startsWith('/assets/') ||
      url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf)$/)
    )
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached
        return fetch(event.request).then((res) => {
          const clone = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          return res
        })
      })
    )
    return
  }

  // Default: network-first with cache fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  )
})
