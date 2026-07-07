'use client';
import { useEffect } from 'react';

/**
 * Cleans up any previously-registered service worker and its caches. EvenUp no
 * longer uses a caching service worker (it caused stale-asset issues); this
 * proactively unregisters old ones and clears their caches so clients always get
 * fresh assets. New visitors register nothing.
 */
export function ServiceWorkerCleanup() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister().catch(() => undefined)))
      .catch(() => undefined);
    if (typeof window !== 'undefined' && 'caches' in window) {
      caches
        .keys()
        .then((keys) => keys.forEach((k) => caches.delete(k)))
        .catch(() => undefined);
    }
  }, []);
  return null;
}
