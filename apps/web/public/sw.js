/*
 * Kill-switch service worker.
 *
 * EvenUp previously shipped a caching service worker for offline reading, but it
 * caused stale-asset issues across deploys. This worker exists only to clean up:
 * any browser still controlled by an old worker will fetch this file, which
 * purges all caches, unregisters itself, and reloads open tabs so clients always
 * end up on fresh content. New visitors never register a worker at all.
 */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        try {
          client.navigate(client.url);
        } catch {
          /* ignore */
        }
      }
    })(),
  );
});

// No fetch handler: all requests go straight to the network.
