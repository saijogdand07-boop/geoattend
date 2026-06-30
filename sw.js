// GeoAttend Service Worker — network-first for HTML so updates always apply immediately
const CACHE = 'geoattend-v2';
const ASSETS = ['/index.html', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const isHTML = e.request.mode === 'navigate' || e.request.url.endsWith('.html') || e.request.url.endsWith('/');
  if (isHTML) {
    // Network-first: always try to get the latest file; fall back to cache only if offline
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request).then(c => c || caches.match('/index.html')))
    );
  } else {
    // Other assets: cache-first is fine, they rarely change
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
  }
});

self.addEventListener('message', e => {
  if (e.data === 'KEEP_ALIVE') {
    self.clients.matchAll().then(clients => clients.forEach(c => c.postMessage('PING')));
  }
});
