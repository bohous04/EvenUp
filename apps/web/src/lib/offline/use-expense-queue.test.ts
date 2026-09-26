// @vitest-environment jsdom
/**
 * The lifecycle wiring for the offline queue.
 *
 * Two things are worth testing here, and one of them is a thing that must NOT
 * happen: no interval, no polling. A timer would wake the radio on a schedule
 * whether or not anything was queued, which is the exact cost this feature
 * exists to avoid — so its absence is asserted, not assumed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { OfflineQueueItem } from '@evenup/core';

// In-memory store: the hook only needs the interface, and the real IndexedDB
// adapter has its own tests.
//
// `vi.hoisted` is required, not stylistic: the `vi.mock` factory is hoisted
// above module initialisation, so a plain `const` here is still in its temporal
// dead zone when the factory runs.
const { queue, store } = vi.hoisted(() => {
  const rows: OfflineQueueItem[] = [];
  return {
    queue: rows,
    store: {
      read: async () => [...rows],
      write: async (items: readonly OfflineQueueItem[]) => {
        rows.splice(0, rows.length, ...items);
      },
      currentGroupId: async () => null,
    },
  };
});

vi.mock('./queue-store', () => ({
  indexedDbQueueStore: store,
  setActiveOfflineGroup: vi.fn(),
}));

import { useExpenseQueue } from './use-expense-queue';

beforeEach(() => {
  // Mutated in place: `queue` is a const binding from `vi.hoisted`, so it
  // cannot be reassigned.
  queue.splice(0, queue.length);
  vi.restoreAllMocks();
  // jsdom reports `navigator.onLine === false` by default, and the runner
  // correctly refuses to send while offline — so the "sends it" tests have to
  // declare a connected browser explicitly.
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

/** Lets the hook's internal promises settle. */
const settle = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

function renderQueue(send: (i: OfflineQueueItem) => Promise<void>, onSynced?: () => void) {
  return renderHook(() => useExpenseQueue({ send, onSynced }));
}

describe('useExpenseQueue — saving', () => {
  /**
   * Write-ahead, not send-then-queue-on-failure. If the app dies between the
   * save and the request, the expense is already on disk. The other order
   * leaves exactly that window — a trip through a tunnel — unprotected.
   */
  it('writes the expense to the queue before attempting to send', async () => {
    const seenWhenSending: number[] = [];
    const { result } = renderQueue(async () => {
      seenWhenSending.push(queue.length);
    });

    await act(async () => {
      await result.current.enqueue('g1', { title: 'Chata' });
    });

    // The item was already in the queue at the moment the send ran.
    expect(seenWhenSending[0]).toBe(1);
  });

  it('reports the expense as landed when the send succeeds', async () => {
    const { result } = renderQueue(async () => {});
    let landed = false;
    await act(async () => {
      landed = await result.current.enqueue('g1', { title: 'Chata' });
    });
    expect(landed).toBe(true);
    expect(queue).toHaveLength(0);
  });

  it('keeps the expense queued when the send fails, and reports it as not landed', async () => {
    const { result } = renderQueue(async () => {
      throw new Error('offline');
    });
    let landed = true;
    await act(async () => {
      landed = await result.current.enqueue('g1', { title: 'Chata' });
    });
    expect(landed).toBe(false);
    // Not lost — that is the entire point.
    expect(queue).toHaveLength(1);
    expect(queue[0]!.payload).toMatchObject({ title: 'Chata' });
  });

  it('gives every expense a distinct idempotency id', async () => {
    const { result } = renderQueue(async () => {
      throw new Error('offline');
    });
    await act(async () => {
      await result.current.enqueue('g1', { title: 'A' });
      await result.current.enqueue('g1', { title: 'B' });
    });
    const ids = new Set(queue.map((i) => i.id));
    expect(ids.size).toBe(2);
  });

  it('notifies the caller when a drain lands something', async () => {
    const onSynced = vi.fn();
    const { result } = renderQueue(async () => {}, onSynced);
    await act(async () => {
      await result.current.enqueue('g1', { title: 'Chata' });
    });
    await waitFor(() => expect(onSynced).toHaveBeenCalled());
  });
});

describe('useExpenseQueue — draining', () => {
  it('sends queued items when the tab becomes visible again', async () => {
    const pendingItem: OfflineQueueItem = {
      id: 'q1',
      groupId: 'g1',
      payload: { title: 'Chata' },
      createdAt: Date.now(),
      attempts: 0,
      nextAttemptAt: Date.now(),
    };
    queue.splice(0, queue.length, pendingItem);
    const send = vi.fn(async () => {});
    renderQueue(send);
    await settle();
    // The mount-time drain already sent it; put it back so the trigger below
    // has something real to send.
    queue.splice(0, queue.length, pendingItem);
    send.mockClear();

    act(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(send).toHaveBeenCalled());
  });

  it('sends queued items when the browser reports the network is back', async () => {
    const pendingItem: OfflineQueueItem = {
      id: 'q1',
      groupId: 'g1',
      payload: { title: 'Chata' },
      createdAt: Date.now(),
      attempts: 0,
      nextAttemptAt: Date.now(),
    };
    queue.splice(0, queue.length, pendingItem);
    const send = vi.fn(async () => {});
    renderQueue(send);
    await settle();
    queue.splice(0, queue.length, pendingItem);
    send.mockClear();

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(send).toHaveBeenCalled());
  });

  /**
   * The battery guarantee, asserted rather than assumed. `setInterval` is
   * stubbed to throw: if the hook ever grows a poller, this fails loudly
   * instead of quietly costing every user a wakeup a minute.
   */
  it('never schedules a timer', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval').mockImplementation((() => {
      throw new Error('the offline queue must not poll');
    }) as unknown as typeof setInterval);

    const { result } = renderQueue(async () => {});
    await act(async () => {
      await result.current.enqueue('g1', { title: 'Chata' });
    });
    await settle();

    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it('does not overlap two drains', async () => {
    const pending: OfflineQueueItem[] = [
      {
        id: 'q1',
        groupId: 'g1',
        payload: { title: 'Chata' },
        createdAt: Date.now(),
        attempts: 0,
        nextAttemptAt: Date.now(),
      },
    ];
    queue.splice(0, queue.length, ...pending);
    let release: () => void = () => {};
    const send = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    renderQueue(send);
    await settle();

    // Two triggers while the first drain is still in flight.
    act(() => {
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(send).toHaveBeenCalledTimes(1);
    await act(async () => {
      release();
    });
  });

  it('removes the listeners on unmount', async () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderQueue(async () => {});
    await settle();
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });
});

describe('useExpenseQueue — counts and discarding', () => {
  it('reports how many items are still waiting', async () => {
    const { result } = renderQueue(async () => {
      throw new Error('offline');
    });
    await act(async () => {
      await result.current.enqueue('g1', { title: 'A' });
    });
    await waitFor(() => expect(result.current.pending).toBe(1));
  });

  it('surfaces an item that used up its attempts as stuck, with its title', async () => {
    queue.splice(
      0,
      queue.length,
      ...[
        {
          id: 'dead',
          groupId: 'g1',
          payload: { title: 'Chata' },
          createdAt: Date.now(),
          attempts: 8,
          nextAttemptAt: 0,
        },
      ],
    );
    const { result } = renderQueue(async () => {});
    // Stuck items are listed with their titles, not counted: the badge has to
    // name them, because an expense the user watched vanish is the worst
    // outcome this feature can produce.
    await waitFor(() => expect(result.current.stuck).toHaveLength(1));
    expect(result.current.stuck[0]!.title).toBe('Chata');
    expect(result.current.pending).toBe(0);
  });

  it('discards an item the user gave up on', async () => {
    const { result } = renderQueue(async () => {
      throw new Error('offline');
    });
    await act(async () => {
      await result.current.enqueue('g1', { title: 'A' });
    });
    await waitFor(() => expect(queue).toHaveLength(1));
    const id = queue[0]!.id;
    await act(async () => {
      await result.current.discard(id);
    });
    expect(queue).toHaveLength(0);
  });
});
