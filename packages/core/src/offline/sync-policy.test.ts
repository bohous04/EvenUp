/**
 * The offline sync policy — pure, no I/O, and the part that actually decides
 * whether a queue is polite to a phone battery.
 *
 * The requirement this encodes: a queue must not "sync too hard". The three
 * failure modes that drain a battery are all here —
 *   - retrying on a **timer** rather than on events (a wakeup per interval);
 *   - a **thundering herd** when connectivity returns and every queued item
 *     fires at once, which pins the radio on for seconds;
 *   - **retrying forever** on an item the server will never accept.
 *
 * `random` is a **parameter**, not a global. Jitter is the whole point of the
 * backoff, and an injected source is what makes "these two queues do not sync
 * in lockstep" an assertion rather than a hope. It is the same seam the FX
 * resolver uses for its fetch.
 */
import { describe, expect, test } from 'vitest';
import {
  SYNC_DEFAULTS,
  backoffDelayMs,
  claimDue,
  isTerminal,
  markFailed,
  markSucceeded,
  nextDelayFor,
  pendingCount,
  type OfflineQueueItem,
  type SyncOptions,
} from './sync-policy.js';

const OPTS: SyncOptions = {};
const NOW = 1_700_000_000_000;

function item(over: Partial<OfflineQueueItem> = {}): OfflineQueueItem {
  return {
    id: 'q1',
    groupId: 'g1',
    payload: { title: 'Chata' } as OfflineQueueItem['payload'],
    createdAt: NOW,
    attempts: 0,
    nextAttemptAt: NOW,
    ...over,
  };
}

describe('backoffDelayMs', () => {
  test('grows with each attempt', () => {
    // Full jitter over a doubling ceiling.
    const at = (n: number) => backoffDelayMs(n, 1, OPTS);
    expect(at(1)).toBe(SYNC_DEFAULTS.baseDelayMs);
    expect(at(2)).toBe(SYNC_DEFAULTS.baseDelayMs * 2);
    expect(at(3)).toBe(SYNC_DEFAULTS.baseDelayMs * 4);
  });

  test('is capped, so a long outage does not push the next try to tomorrow', () => {
    expect(backoffDelayMs(40, 1, OPTS)).toBe(SYNC_DEFAULTS.maxDelayMs);
  });

  test('honours a caller-supplied schedule', () => {
    const opts: SyncOptions = { baseDelayMs: 1000, maxDelayMs: 4000, maxAttempts: 3 };
    expect(backoffDelayMs(10, 1, opts)).toBe(4000);
  });

  /**
   * The reason jitter exists. Without it every device that lost signal in the
   * same place comes back and retries in the same millisecond, which is the
   * worst possible thing to ask a cell radio to do.
   */
  test('jitter spreads retries rather than synchronising them', () => {
    const early = backoffDelayMs(5, 0, OPTS);
    const late = backoffDelayMs(5, 0.999999, OPTS);
    expect(early).toBeLessThan(late);
    // And the spread is bounded by the computed ceiling, never above it.
    expect(late).toBeLessThanOrEqual(backoffDelayMs(5, 1, OPTS));
  });

  test('jitter never returns a negative or zero wait', () => {
    for (const r of [0, 0.25, 0.5, 0.75, 1]) {
      expect(backoffDelayMs(3, r, OPTS)).toBeGreaterThan(0);
    }
  });
});

describe('claimDue', () => {
  test('returns nothing when the queue is empty', () => {
    expect(claimDue([], NOW, OPTS)).toEqual([]);
  });

  /**
   * The cap is the battery protection: a morning-after-a-cabin queue of forty
   * expenses must not become forty requests in one burst.
   */
  test('takes at most one batch', () => {
    const many = Array.from({ length: 25 }, (_, i) => item({ id: `q${i}` }));
    expect(claimDue(many, NOW, OPTS)).toHaveLength(SYNC_DEFAULTS.batchSize);
  });

  test('skips items whose backoff has not elapsed', () => {
    const queue = [
      item({ id: 'later', nextAttemptAt: NOW + 60_000 }),
      item({ id: 'due', nextAttemptAt: NOW - 1 }),
    ];
    expect(claimDue(queue, NOW, OPTS).map((i) => i.id)).toEqual(['due']);
  });

  test('never resurfaces a terminally-failed item', () => {
    const queue = [item({ id: 'dead', attempts: SYNC_DEFAULTS.maxAttempts, nextAttemptAt: 0 })];
    expect(claimDue(queue, NOW, OPTS)).toEqual([]);
  });

  /**
   * Ordering is not cosmetic. Three expenses added on a trip should land in
   * the order they happened, or the balances are briefly wrong and the
   * activity feed reads out of sequence.
   */
  test('drains oldest-first, regardless of id or attempt count', () => {
    const queue = [
      item({ id: 'newest', createdAt: NOW }),
      item({ id: 'oldest', createdAt: NOW - 10_000, attempts: 3 }),
      item({ id: 'middle', createdAt: NOW - 5_000 }),
    ];
    expect(claimDue(queue, NOW, OPTS).map((i) => i.id)).toEqual(['oldest', 'middle', 'newest']);
  });

  test('a due item is not starved by a long queue in front of it', () => {
    const many = Array.from({ length: 30 }, (_, i) => item({ id: `q${i}`, createdAt: NOW + i }));
    const urgent = item({ id: 'urgent', createdAt: NOW - 60_000, attempts: 1 });
    const claimed = claimDue([...many, urgent], NOW, OPTS);
    // Oldest first means the urgent one leads the batch.
    expect(claimed[0]!.id).toBe('urgent');
  });
});

describe('markSucceeded / markFailed', () => {
  test('removes a succeeded item', () => {
    expect(markSucceeded([item({ id: 'a' }), item({ id: 'b' })], 'a').map((i) => i.id)).toEqual([
      'b',
    ]);
  });

  test('recording a failure bumps the attempt count and schedules the retry', () => {
    const [next] = markFailed([item({ attempts: 0 })], 'q1', 'offline', NOW, 0.5, OPTS);
    expect(next!.attempts).toBe(1);
    expect(next!.lastError).toBe('offline');
    expect(next!.nextAttemptAt).toBe(NOW + backoffDelayMs(1, 0.5, OPTS));
  });

  test('leaves other items untouched', () => {
    const queue = [item({ id: 'a' }), item({ id: 'b', attempts: 4 })];
    const next = markFailed(queue, 'a', 'boom', NOW, 0.5, OPTS);
    expect(next[1]!.attempts).toBe(4);
  });

  test('an unknown id is a no-op rather than a crash', () => {
    const queue = [item({ id: 'a' })];
    expect(markSucceeded(queue, 'nope')).toHaveLength(1);
    expect(markFailed(queue, 'nope', 'x', NOW, 0.5, OPTS)).toHaveLength(1);
  });
});

describe('isTerminal / pendingCount', () => {
  test('an item is terminal once it has used up its attempts', () => {
    expect(isTerminal(item({ attempts: SYNC_DEFAULTS.maxAttempts - 1 }))).toBe(false);
    expect(isTerminal(item({ attempts: SYNC_DEFAULTS.maxAttempts }))).toBe(true);
    expect(isTerminal(item({ attempts: SYNC_DEFAULTS.maxAttempts + 5 }))).toBe(true);
  });

  test('honours a custom attempt budget', () => {
    const opts: SyncOptions = { maxAttempts: 2 };
    expect(isTerminal(item({ attempts: 2 }), opts)).toBe(true);
    expect(isTerminal(item({ attempts: 1 }), opts)).toBe(false);
  });

  test('counts only what still has a chance of landing', () => {
    const queue = [
      item({ id: 'a', attempts: 0 }),
      item({ id: 'b', attempts: 0 }),
      item({ id: 'dead', attempts: SYNC_DEFAULTS.maxAttempts }),
    ];
    expect(pendingCount(queue)).toBe(2);
  });
});

describe('nextDelayFor', () => {
  test('returns the wait before the next attempt for an item', () => {
    expect(nextDelayFor(item({ nextAttemptAt: NOW + 30_000 }), NOW)).toBe(30_000);
  });

  test('never returns a negative wait for an already-due item', () => {
    expect(nextDelayFor(item({ nextAttemptAt: NOW - 5_000 }), NOW)).toBe(0);
  });
});
