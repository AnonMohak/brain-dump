// Sift service worker: keeps the app shell available offline.
// It never caches /api: your items always come from the server.
// All paths are relative to the scope, so the same file works at "/" and at "/sift/".
const CACHE = 'sift-shell-v2'
const BASE = new URL(self.registration.scope).pathname
const SHELL = ['', 'manifest.webmanifest', 'favicon.png', 'favicon-dark.png', 'icon-192.png'].map((path) => BASE + path)

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith(BASE + 'api/')) return

  // Pages: network first, so a new build shows at once; the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          if (response.ok) caches.open(CACHE).then((cache) => cache.put(BASE, copy))
          return response
        })
        .catch(() => caches.match(BASE)),
    )
    return
  }

  // Built assets have hashed names: cache first, then the network.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok && (url.pathname.startsWith(BASE + 'assets/') || SHELL.includes(url.pathname))) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        }),
    ),
  )
})
