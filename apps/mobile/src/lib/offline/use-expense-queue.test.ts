/**
 * The Expo lifecycle wiring. `expo-network` and `AppState` are mocked, so what
 * is under test is the *decisions* — when to ask, and what happens when two
 * things arrive at once — not the native modules.
 */
import { renderHook, act } from '@testing-library/react-native';
import type { OfflineQueueItem, OfflineQueueStore } from '@evenup/core';

type Listener = (state: unknown) => void;
const mockAppStateListeners: Listener[] = [];
const mockNetListeners: Listener[] = [];
let mockOnline = true;

jest.mock('react-native', () => ({
  AppState: {
    addEventListener: (_: string, fn: Listener) => {
      mockAppStateListeners.push(fn);
      return { remove: jest.fn() };
    },
  },
}));

jest.mock('expo-network', () => ({
  getNetworkStateAsync: async () => ({ isInternetReachable: mockOnline }),
  addNetworkStateListener: (fn: Listener) => {
    mockNetListeners.push(fn);
    return { remove: jest.fn() };
  },
}));

// The default store pulls in AsyncStorage, which is a native module this test
// does not need: every case injects its own store.
jest.mock('./queue-store', () => ({
  asyncStorageQueueStore: {
    read: async () => [],
    write: async () => {},
    currentGroupId: async () => null,
  },
  setActiveOfflineGroup: jest.fn(),
}));

import { useExpenseQueue } from './use-expense-queue';

const NOW = 1_700_000_000_000;
const item = (over: Partial<OfflineQueueItem> = {}): OfflineQueueItem => ({
  id: 'q1',
  groupId: 'g1',
  payload: { title: 'Chata' },
  createdAt: NOW,
  attempts: 0,
  nextAttemptAt: NOW,
  ...over,
});

function makeStore(initial: OfflineQueueItem[] = []) {
  const rows = [...initial];
  const store: OfflineQueueStore = {
    read: async () => [...rows],
    write: async (items) => {
      rows.splice(0, rows.length, ...items);
    },
    currentGroupId: async () => 'g1',
  };
  return { store, rows };
}

const settle = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

beforeEach(() => {
  mockAppStateListeners.length = 0;
  mockNetListeners.length = 0;
  mockOnline = true;
});

describe('useExpenseQueue — saving', () => {
  it('writes to the queue before sending', async () => {
    const { store, rows } = makeStore();
    const seen: number[] = [];
    const { result } = renderHook(() =>
      useExpenseQueue({
        store,
        send: async () => {
          seen.push(rows.length);
        },
      }),
    );
    await act(async () => {
      await result.current.enqueue('g1', { title: 'Chata' });
    });
    expect(seen[0]).toBe(1);
  });

  it('reports landed when the send succeeds', async () => {
    const { store } = makeStore();
    const { result } = renderHook(() => useExpenseQueue({ store, send: async () => {} }));
    let landed = false;
    await act(async () => {
      landed = await result.current.enqueue('g1', { title: 'Chata' });
    });
    expect(landed).toBe(true);
  });

  it('keeps the expense queued and reports it as not landed on failure', async () => {
    const { store, rows } = makeStore();
    const { result } = renderHook(() =>
      useExpenseQueue({
        store,
        send: async () => {
          throw new Error('offline');
        },
      }),
    );
    let landed = true;
    await act(async () => {
      landed = await result.current.enqueue('g1', { title: 'Chata' });
    });
    expect(landed).toBe(false);
    expect(rows).toHaveLength(1);
  });

  it('sends nothing while the network says it is unreachable', async () => {
    mockOnline = false;
    const { store } = makeStore([item()]);
    const send = jest.fn(async () => {});
    renderHook(() => useExpenseQueue({ store, send }));
    await settle();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('useExpenseQueue — lifecycle triggers', () => {
  it('drains when the app comes to the foreground', async () => {
    const { store, rows } = makeStore();
    const send = jest.fn(async () => {});
    renderHook(() => useExpenseQueue({ store, send }));
    await settle();
    rows.splice(0, rows.length, item());
    send.mockClear();

    await act(async () => {
      mockAppStateListeners.forEach((fn) => fn('active'));
    });
    await settle();
    expect(send).toHaveBeenCalled();
  });

  it('ignores the app going to the background', async () => {
    const { store, rows } = makeStore();
    const send = jest.fn(async () => {});
    renderHook(() => useExpenseQueue({ store, send }));
    await settle();
    rows.splice(0, rows.length, item());
    send.mockClear();

    await act(async () => {
      mockAppStateListeners.forEach((fn) => fn('background'));
    });
    await settle();
    // Backgrounding is the moment a device is MOST likely to be asleep; a
    // drain here would be pure waste.
    expect(send).not.toHaveBeenCalled();
  });

  it('drains when the network comes back', async () => {
    const { store, rows } = makeStore();
    const send = jest.fn(async () => {});
    renderHook(() => useExpenseQueue({ store, send }));
    await settle();
    rows.splice(0, rows.length, item());
    send.mockClear();

    await act(async () => {
      mockNetListeners.forEach((fn) => fn({ isInternetReachable: true }));
    });
    await settle();
    expect(send).toHaveBeenCalled();
  });

  it('does not overlap two drains', async () => {
    const { store, rows } = makeStore();
    rows.splice(0, rows.length, item());
    let release: () => void = () => {};
    const send = jest.fn(
      () =>
        new Promise<void>((r) => {
          release = r;
        }),
    );
    renderHook(() => useExpenseQueue({ store, send }));
    await settle();

    await act(async () => {
      mockAppStateListeners.forEach((fn) => fn('active'));
      mockNetListeners.forEach((fn) => fn({ isInternetReachable: true }));
    });
    await settle();
    expect(send).toHaveBeenCalledTimes(1);
    await act(async () => {
      release();
    });
  });
});

describe('useExpenseQueue — counts', () => {
  it('surfaces a spent item as stuck, with its title', async () => {
    const { store } = makeStore([item({ attempts: 8 })]);
    const { result } = renderHook(() => useExpenseQueue({ store, send: async () => {} }));
    await settle();
    expect(result.current.stuck).toHaveLength(1);
    expect(result.current.stuck[0]!.title).toBe('Chata');
    expect(result.current.pending).toBe(0);
  });

  it('discards an item the user gave up on', async () => {
    const { store, rows } = makeStore([item()]);
    const { result } = renderHook(() => useExpenseQueue({ store, send: async () => {} }));
    await settle();
    await act(async () => {
      await result.current.discard('q1');
    });
    expect(rows).toHaveLength(0);
  });
});
