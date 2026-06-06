// GeoAttend Service Worker — enables offline + background tracking
const CACHE = 'geoattend-v1';
const ASSETS = ['/', '/index.html', '/manifest.json'];

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
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => caches.match('/index.html')))
  );
});

// Background sync — wake up the page every 30s to re-check location
self.addEventListener('message', e => {
  if (e.data === 'KEEP_ALIVE') {
    // Ping all open clients to keep GPS watch alive
    self.clients.matchAll().then(clients => clients.forEach(c => c.postMessage('PING')));
  }
});
