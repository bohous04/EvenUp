/**
 * The shared queue runner.
 *
 * These tests are mostly about what does NOT happen: a queue that tries
 * things it shouldn't is the expensive kind of bug, and it looks fine in
 * every screenshot.
 */
import { describe, expect, test, vi } from 'vitest';
import { drainQueue, type OfflineQueueStore, type SyncEnvironment } from './queue.js';
import { SYNC_DEFAULTS, type OfflineQueueItem } from './sync-policy.js';

const NOW = 1_700_000_000_000;

function item(over: Partial<OfflineQueueItem> = {}): OfflineQueueItem {
  return {
    id: 'q1',
    groupId: 'g1',
    payload: { title: 'Chata' },
    createdAt: NOW,
    attempts: 0,
    nextAttemptAt: NOW,
    ...over,
  };
}

function makeStore(initial: OfflineQueueItem[], groupId: string | null = 'g1') {
  let items = [...initial];
  return {
    store: {
      read: async () => [...items],
      write: async (next: readonly OfflineQueueItem[]) => {
        items = [...next];
      },
      currentGroupId: async () => groupId,
    } satisfies OfflineQueueStore,
    items: () => items,
  };
}

function env(over: Partial<SyncEnvironment> = {}): SyncEnvironment {
  return {
    now: () => NOW,
    random: () => 0.5,
    isOnline: () => true,
    ...over,
  };
}

describe('drainQueue — when it does nothing', () => {
  /**
   * The battery guard, and the one most likely to be got wrong: a network
   * that reports itself up is not a network that works (captive portals, a
   * dead cell site). Trying anyway is what burns the battery, so the check
   * happens before anything is read or sent.
   */
  test('sends nothing at all when offline', async () => {
    const { store, items } = makeStore([item()]);
    const send = vi.fn();

    const result = await drainQueue(store, send, env({ isOnline: () => false }));

    expect(send).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
    // The item is still queued, untouched, waiting for real connectivity.
    expect(items()).toHaveLength(1);
    expect(items()[0]!.attempts).toBe(0);
  });

  test('sends nothing when no item is due yet', async () => {
    const { store } = makeStore([item({ nextAttemptAt: NOW + 60_000 })]);
    const send = vi.fn();

    const result = await drainQueue(store, send, env());

    expect(send).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
  });

  test('does not resurface an item that already used up its attempts', async () => {
    const stuck = item({ attempts: SYNC_DEFAULTS.maxAttempts });
    const { store } = makeStore([stuck]);
    const send = vi.fn();

    const result = await drainQueue(store, send, env());

    expect(send).not.toHaveBeenCalled();
    // Surfaced as needing the user, not silently retried forever.
    expect(result.stuck).toBe(1);
  });
});

describe('drainQueue — sending', () => {
  test('removes an item that lands', async () => {
    const { store, items } = makeStore([item()]);

    const result = await drainQueue(store, async () => {}, env());

    expect(result.sent).toBe(1);
    expect(items()).toHaveLength(0);
  });

  test('sends at most one batch, leaving the rest queued', async () => {
    const many = Array.from({ length: 12 }, (_, i) => item({ id: `q${i}`, createdAt: NOW + i }));
    const { store, items } = makeStore(many);
    const send = vi.fn(async () => {});

    await drainQueue(store, send, env());

    expect(send).toHaveBeenCalledTimes(SYNC_DEFAULTS.batchSize);
    expect(items()).toHaveLength(12 - SYNC_DEFAULTS.batchSize);
  });

  test("drains oldest-first, so a trip's expenses land in order", async () => {
    const queue = [
      item({ id: 'newest', createdAt: NOW }),
      item({ id: 'oldest', createdAt: NOW - 10_000 }),
    ];
    const { store } = makeStore(queue);
    const order: string[] = [];

    await drainQueue(
      store,
      async (i) => {
        order.push(i.id);
      },
      env(),
    );

    expect(order).toEqual(['oldest', 'newest']);
  });

  test('persists the shrink to storage', async () => {
    const { store, items } = makeStore([item()]);
    await drainQueue(store, async () => {}, env());
    // A runner that resolves but forgets to write leaves the expense to be
    // re-sent forever on the next foreground.
    expect(items()).toHaveLength(0);
  });
});

describe('drainQueue — failure', () => {
  test('records the failure and reschedules instead of dropping the expense', async () => {
    const { store, items } = makeStore([item()]);

    const result = await drainQueue(
      store,
      async () => {
        throw new Error('network unreachable');
      },
      env(),
    );

    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
    // The expense is NOT lost — that is the whole point of a queue.
    expect(items()).toHaveLength(1);
    expect(items()[0]!.attempts).toBe(1);
    expect(items()[0]!.lastError).toBe('network unreachable');
    expect(items()[0]!.nextAttemptAt).toBeGreaterThan(NOW);
  });

  test('uses the injected clock and random, so the delay is deterministic here', async () => {
    const { store, items } = makeStore([item()]);
    await drainQueue(
      store,
      async () => {
        throw new Error('boom');
      },
      env({ now: () => NOW, random: () => 1 }),
    );
    // random = 1 means the full ceiling for the first retry: baseDelayMs.
    expect(items()[0]!.nextAttemptAt).toBe(NOW + SYNC_DEFAULTS.baseDelayMs);
  });

  test('one failing item does not stop the rest of the batch', async () => {
    const { store, items } = makeStore([
      item({ id: 'bad', createdAt: NOW }),
      item({ id: 'good', createdAt: NOW + 1 }),
    ]);

    const result = await drainQueue(
      store,
      async (i) => {
        if (i.id === 'bad') throw new Error('nope');
      },
      env(),
    );

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    expect(items().map((i) => i.id)).toEqual(['bad']);
  });

  test('reaches the stuck state after the attempt budget is spent', async () => {
    const { store, items } = makeStore([item({ attempts: SYNC_DEFAULTS.maxAttempts - 1 })]);
    const fail = async () => {
      throw new Error('still broken');
    };

    const result = await drainQueue(store, fail, env());

    expect(items()[0]!.attempts).toBe(SYNC_DEFAULTS.maxAttempts);
    expect(result.stuck).toBe(1);
    // And a further drain will not touch it.
    const again = await drainQueue(store, fail, env());
    expect(again.sent).toBe(0);
    expect(again.failed).toBe(0);
  });

  test('a non-Error rejection is still recorded as text', async () => {
    const { store, items } = makeStore([item()]);
    await drainQueue(
      store,
      async () => {
        throw 'just a string';
      },
      env(),
    );
    expect(items()[0]!.lastError).toBe('just a string');
  });
});
