/**
 * In-memory sliding-window rate limiter (PRD §9.2). Single-instance assumption
 * fits self-hosting. `now` is injectable for deterministic tests.
 */
import type { RateLimiter } from './context.js';

export function createRateLimiter(opts: {
  max: number;
  windowMs: number;
  now?: () => number;
}): RateLimiter {
  const now = opts.now ?? (() => Date.now());
  const hits = new Map<string, number[]>();
  return {
    check(key: string): boolean {
      const t = now();
      const cutoff = t - opts.windowMs;
      const recent = (hits.get(key) ?? []).filter((ts) => ts > cutoff);
      if (recent.length >= opts.max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(t);
      hits.set(key, recent);
      return true;
    },
  };
}
