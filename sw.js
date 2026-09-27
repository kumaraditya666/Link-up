/* Link Up v1.3 — app shell */
const CACHE = 'linkup-v2';
const CORE = ['./', './index.html', './manifest.webmanifest', './favicon.svg', './css/app.css', './js/app.js', './js/data.js', './js/map.js', './js/events.js', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (request.mode === 'navigate') {
    e.respondWith(fetch(request).then((r) => { const c = r.clone(); caches.open(CACHE).then((cc) => cc.put('./index.html', c)); return r; }).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((r) => { const c = r.clone(); caches.open(CACHE).then((cc) => cc.put(request, c)); return r; }).catch(() => caches.match('./index.html'))));
});
