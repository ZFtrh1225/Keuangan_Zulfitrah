/**
 * sw.js — Service Worker for Money Tracker Pro
 * Strategy:
 *  - Static shell: cache-first
 *  - Chart.js / Google Fonts: cache-first
 *  - Apps Script API (POST): network-only (data must be fresh)
 */

const CACHE_NAME = 'mtpro-v3-2026-05-27';
const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './js/formatters.js',
  './js/state.js',
  './js/api.js',
  './js/charts.js',
  './js/app.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS).catch(() => null))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Bypass cache untuk API Apps Script (POST atau ke domain script.google.com)
  if (req.method !== 'GET' || url.hostname.includes('script.google.com')) {
    return; // network-only
  }

  // Static assets dari same-origin: cache-first
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, clone)).catch(() => {});
          }
          return res;
        }).catch(() => caches.match('./index.html'));
      })
    );
    return;
  }

  // External (Chart.js CDN, fonts): cache-first dengan stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req).then((res) => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
});
