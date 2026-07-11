/*
 * EvenUp service worker — an instant app shell without the stale-asset trap that
 * retired the previous caching worker.
 *
 * Strategy (deliberately conservative):
 *  - /_next/static/*  (content-hashed, immutable): cache-first. A rebuild changes
 *    the filename, so a cached chunk can never go stale — this is 100% safe and
 *    is the bulk of the startup bytes, so it loads instantly on repeat launches.
 *  - navigations (the HTML app shell): network-first with a short timeout, then
 *    fall back to the cached shell. When the server is warm the user always gets
 *    fresh HTML; when it is cold/slow/offline they get an instant cached shell
 *    while a background fetch refreshes it for next time. The shell is
 *    client-rendered (no user data in the HTML), so serving a cached one is safe.
 *  - everything else (/api, auth, receipts, …): straight to the network, never
 *    cached — dynamic data is always live.
 *
 * Bump VERSION to invalidate every cache on the next activation.
 */
const VERSION = 'v1';
const STATIC_CACHE = `evenup-static-${VERSION}`;
const SHELL_CACHE = `evenup-shell-${VERSION}`;
const SHELL_TIMEOUT_MS = 2500;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== STATIC_CACHE && k !== SHELL_CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(navigationFirst(event));
    return;
  }
  // Everything else falls through to the browser's default network handling.
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}

async function navigationFirst(event) {
  const request = event.request;
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  // Keep the worker alive until the background refresh (and its cache write) finishes.
  event.waitUntil(network.catch(() => undefined));

  if (!cached) {
    const fresh = await network;
    return fresh || new Response('Offline', { status: 503, statusText: 'Offline' });
  }
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve('timeout'), SHELL_TIMEOUT_MS);
  });
  const raced = await Promise.race([network, timeout]);
  clearTimeout(timer); // don't leave the loser timer pending when the network wins
  return raced && raced !== 'timeout' ? raced : cached;
}
