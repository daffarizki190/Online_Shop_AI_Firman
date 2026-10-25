/* Aura Atelier — service worker sederhana: cache-first untuk app shell */
const CACHE = 'aura-atelier-v11';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/css/app.css',
  '/js/data.js',
  '/js/size-engine.js',
  '/js/app.js',
  '/assets/boxy-tee-noir.jpg',
  '/assets/icon.svg',
  '/assets/icon-maskable.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // API & service worker tidak boleh di-cache (selalu ke server)
  if (url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      });
    }).catch(() => caches.match('/index.html'))
  );
});
