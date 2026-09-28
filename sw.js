/* Link Up v1.3 — app shell */
const CACHE = 'linkup-v38';
const CORE = ['./', './index.html', './manifest.webmanifest', './favicon.svg', './css/app.css', './js/app.js', './js/data.js', './js/map.js', './js/events.js', './js/net.js', './js/route.js', './js/notify.js', './js/social.js', './js/geo.js', './js/load-glb.js', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png'];
const VENDOR = ['./js/vendor/three.module.js'];
const MODELS = ["./models/manifest.json","./models/academic-high.glb","./models/academic-low.glb","./models/admin-high.glb","./models/admin-low.glb","./models/amul-high.glb","./models/amul-low.glb","./models/apj-high.glb","./models/apj-low.glb","./models/canteen-high.glb","./models/canteen-low.glb","./models/design-high.glb","./models/design-low.glb","./models/flag-high.glb","./models/flag-low.glb","./models/gate-high.glb","./models/gate-low.glb","./models/girls-high.glb","./models/girls-low.glb","./models/guest-high.glb","./models/guest-low.glb","./models/gym-high.glb","./models/gym-low.glb","./models/hostel-high.glb","./models/hostel-low.glb","./models/kiosk-high.glb","./models/kiosk-low.glb","./models/library-high.glb","./models/library-low.glb","./models/moksha-stage-high.glb","./models/moksha-stage-low.glb","./models/smart-high.glb","./models/smart-low.glb"]
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll([...CORE, ...VENDOR]).then(() => c.addAll(MODELS).catch(() => {}))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const view = (e.notification.data && e.notification.data.view) || 'map';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { try { c.focus(); c.postMessage({ linkup: 'go', view }); } catch {} return; }
    if (clients.openWindow) return clients.openWindow('./#/' + view);
  }));
});
/* Push-ready: a future backend can POST Web Push here; payload {title, body, view} */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.notification?.data || e.data?.json() || {}; } catch {}
  e.waitUntil(self.registration.showNotification(d.title || 'Link Up ⚡', {
    body: d.body || 'Something’s happening on campus.',
    icon: './icons/icon-192.png', badge: './icons/icon-192.png',
    data: { view: d.view || 'map' },
  }));
});
self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (request.mode === 'navigate') {
    e.respondWith(fetch(request).then((r) => { const c = r.clone(); caches.open(CACHE).then((cc) => cc.put('./index.html', c)); return r; }).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((r) => {
    // never cache partial/failed responses — a truncated JS file kills the app
    if (r && r.ok) { const c = r.clone(); caches.open(CACHE).then((cc) => cc.put(request, c).catch(() => {})); }
    return r;
  }).catch(() => caches.match('./index.html'))));
});
