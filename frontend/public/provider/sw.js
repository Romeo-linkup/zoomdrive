// ZoomDrive provider service worker. Scope: /provider/
// Never touches API calls (they live on another origin and must always hit the network).
const APP = 'provider';
const VERSION = 'zd-' + APP + '-v1';
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
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
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
              shell || new Response('<h1>You are offline</h1><p>Reconnect and try again.</p>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
            );
          }
          return new Response('', { status: 504 });
        })
      )
  );
});
