// ZoomDrive driver service worker. Scope: /driver/
// Never touches API calls (they live on another origin and must always hit the network).
const APP = 'driver';
const VERSION = 'zd-' + APP + '-v2';
const SHELL = [
  '/' + APP + '/',
  '/' + APP + '/app.js',
  '/' + APP + '/manifest.webmanifest',
  '/shared/config.js',
  '/shared/styles/tokens.css',
  '/shared/styles/base.css',
  '/shared/styles/components.css',
  '/brand/logo.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
  );
});

// An updated worker waits until the page asks it to take over (update toast arrives in Phase 13).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('zd-' + APP + '-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;       // API and CDN calls pass straight through
  if (url.pathname.startsWith('/api/')) return;

  // Network first so new deployments show immediately; the cache is the offline fallback.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => {
          if (hit) return hit;
          if (req.mode === 'navigate') {
            return caches.match('/' + APP + '/').then((shell) =>
              shell || new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>Offline</title><body style="font-family:system-ui,sans-serif;padding:24px"><div role="status">You are offline. Some features will not work.</div></body></html>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
            );
          }
          return new Response('', { status: 504 });
        })
      )
  );
});
