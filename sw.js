// NZ Camp Planner — offline support.
// The app itself and Leaflet are kept for offline use; map tiles you have looked at are kept too (up to ~2,500),
// so areas you browsed before a trip still show with no signal. Campsite data lives inside index.html.
const VERSION = 'nzcamp-2026-10-29b';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'];
const TILE_HOSTS = /(^|\.)(tile\.opentopomap\.org|tile\.openstreetmap\.org|server\.arcgisonline\.com)$/;
const TILE_MAX = 2500;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== 'tiles').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
let trimming = false;
async function trimTiles() {
  if (trimming) return; trimming = true;
  try { const c = await caches.open('tiles'), keys = await c.keys(); for (let i = 0; i < keys.length - TILE_MAX; i++) await c.delete(keys[i]); }
  finally { trimming = false; }
}
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // the app page: newest copy when online, saved copy when offline
  if (req.mode === 'navigate' || (url.origin === location.origin && /(\/|index\.html)$/.test(url.pathname))) {
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put('index.html', cp)); return r; })
      .catch(() => caches.match('index.html').then(r => r || caches.match('./'))));
    return;
  }
  // app files and Leaflet: saved copy first
  if (url.origin === location.origin || url.hostname === 'cdnjs.cloudflare.com') {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(n => { if (n.ok) { const cp = n.clone(); caches.open(VERSION).then(c => c.put(req, cp)); } return n; })));
    return;
  }
  // map tiles: saved copy first, otherwise fetch (as CORS so it can be kept) and keep it
  if (TILE_HOSTS.test(url.hostname)) {
    e.respondWith(caches.open('tiles').then(c => c.match(req.url).then(hit => hit || fetch(req.url, { mode: 'cors', credentials: 'omit' })
      .then(n => { if (n.ok) { c.put(req.url, n.clone()); trimTiles(); } return n; })
      .catch(() => fetch(req)))));
    return;
  }
  // everything else (heights, routing, place search, data refresh) goes straight to the network
});
