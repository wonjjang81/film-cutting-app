/* Static assets only: never cache authenticated documents or API responses. */
const PWA_VERSION = 'v1';
const BASE = new URL('./', self.location.href);
const PREFIX = 'film-pwa-' + encodeURIComponent(BASE.pathname) + '-';
const CACHE = PREFIX + PWA_VERSION;
const OFFLINE = new URL('offline.html', BASE).href;
const PRECACHE = ['offline.html', 'manifest.webmanifest', 'icons/pwa-192.png', 'icons/pwa-512.png', 'icons/pwa-maskable-512.png', 'icons/apple-touch-icon.png'].map(path => new URL(path, BASE).href);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  const path = url.pathname.slice(BASE.pathname.length);
  if (path === 'api' || path.startsWith('api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE)));
    return;
  }
  const immutable = path.startsWith('_expo/static/') && /\.(js|css|png|jpg|webp|woff2?|ttf|otf)$/.test(url.pathname);
  const known = !url.search && PRECACHE.includes(url.href);
  if (!immutable && !known) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && !response.redirected && response.type === 'basic') await cache.put(request, response.clone());
    return response;
  })());
});
