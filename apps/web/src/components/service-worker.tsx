'use client';
import { useEffect } from 'react';

/**
 * Registers the caching service worker (see `public/sw.js`) in production so the
 * installed PWA opens from an instant cached shell + cached static assets rather
 * than a full cold-network fetch on every launch. Best-effort — a failure is
 * silent and the app just falls back to plain network loading.
 *
 * In development it does the opposite: unregister any lingering worker so a
 * previously-installed one never intercepts HMR / dev assets.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister().catch(() => undefined)))
        .catch(() => undefined);
      return;
    }

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    };
    if (document.readyState === 'complete') {
      register();
      return;
    }
    window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
