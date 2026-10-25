/* Aura Atelier — service worker: app shell offline.
 * Catatan: bundle Vite memakai nama ber-hash, jadi hanya dokumen inti yang
 * di-precache; aset lain di-cache runtime saat pertama kali diakses. */
const CACHE = 'aura-atelier-v24';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/spec.html'];

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
