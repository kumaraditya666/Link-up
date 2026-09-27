/* Link Up v1.3 — app shell */
const CACHE = 'linkup-v6';
const CORE = ['./', './index.html', './manifest.webmanifest', './favicon.svg', './css/app.css', './js/app.js', './js/data.js', './js/map.js', './js/events.js', './js/net.js', './js/load-glb.js', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png'];
const VENDOR = ['./js/vendor/three.module.js'];
const MODELS = ['./models/manifest.json', './models/admin-high.glb', './models/admin-low.glb', './models/amphi-high.glb', './models/amphi-low.glb', './models/amul-high.glb', './models/amul-low.glb', './models/apj-high.glb', './models/apj-low.glb', './models/canteen-high.glb', './models/canteen-low.glb', './models/gate-high.glb', './models/gate-low.glb', './models/hostel-high.glb', './models/hostel-low.glb', './models/innovation-high.glb', './models/innovation-low.glb', './models/library-high.glb', './models/library-low.glb', './models/moksha-stage-high.glb', './models/moksha-stage-low.glb', './models/nescafe-high.glb', './models/nescafe-low.glb', './models/pavilion-high.glb', './models/pavilion-low.glb', './models/sac-high.glb', './models/sac-low.glb', './models/sports-high.glb', './models/sports-low.glb'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll([...CORE, ...VENDOR]).then(() => c.addAll(MODELS).catch(() => {}))).then(() => self.skipWaiting())); });
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
