/**
 * The Expo queue store. AsyncStorage is mocked wholesale — what matters here is
 * the defensive parsing and the best-effort contract, neither of which is about
 * the storage library.
 */

const mockStore = new Map<string, string>();
let mockFailWrite = false;
let mockFailRead = false;

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => {
      if (mockFailRead) throw new Error('storage unavailable');
      return mockStore.get(k) ?? null;
    },
    setItem: async (k: string, v: string) => {
      if (mockFailWrite) throw new Error('quota exceeded');
      mockStore.set(k, v);
    },
  },
}));

import { asyncStorageQueueStore, setActiveOfflineGroup } from './queue-store';

const NOW = 1_700_000_000_000;
const KEY = 'evenup.offline.expense-queue.v1';
const item = (over: Record<string, unknown> = {}) => ({
  id: 'q1',
  groupId: 'g1',
  payload: { title: 'Chata' },
  createdAt: NOW,
  attempts: 0,
  nextAttemptAt: NOW,
  ...over,
});

beforeEach(() => {
  mockStore.clear();
  mockFailWrite = false;
  mockFailRead = false;
});

describe('asyncStorageQueueStore', () => {
  it('reads an empty queue when nothing was queued', async () => {
    await expect(asyncStorageQueueStore.read()).resolves.toEqual([]);
  });

  it('round-trips items', async () => {
    await asyncStorageQueueStore.write([item({ id: 'a' }) as never]);
    const read = await asyncStorageQueueStore.read();
    expect(read).toHaveLength(1);
    expect(read[0]!.id).toBe('a');
  });

  /**
   * A stored item crosses an app version boundary, so it cannot be trusted.
   * A half-written or stale record handed to the sync runner would otherwise
   * crash on the expense path — the one place a crash loses the user's work.
   */
  it('drops records that do not look like queue items', async () => {
    mockStore.set(
      KEY,
      JSON.stringify([
        item({ id: 'good' }),
        { id: 'missing-fields' },
        'not an object',
        null,
        { ...item({ id: 'bad-attempts' }), attempts: 'lots' },
      ]),
    );
    const read = await asyncStorageQueueStore.read();
    expect(read.map((i) => i.id)).toEqual(['good']);
  });

  it('survives corrupt JSON rather than throwing', async () => {
    mockStore.set(KEY, '{ this is not json');
    await expect(asyncStorageQueueStore.read()).resolves.toEqual([]);
  });

  it('survives a non-array payload', async () => {
    mockStore.set(KEY, JSON.stringify({ items: [] }));
    await expect(asyncStorageQueueStore.read()).resolves.toEqual([]);
  });

  /** Losing the offline feature must never lose the expense. */
  it('swallows a failed write', async () => {
    mockFailWrite = true;
    await expect(asyncStorageQueueStore.write([item() as never])).resolves.toBeUndefined();
  });

  it('reports an empty queue when storage is unavailable', async () => {
    mockFailRead = true;
    await expect(asyncStorageQueueStore.read()).resolves.toEqual([]);
  });
});

describe('setActiveOfflineGroup', () => {
  it('remembers the active group', async () => {
    setActiveOfflineGroup('g-42');
    await expect(asyncStorageQueueStore.currentGroupId()).resolves.toBe('g-42');
  });

  it('clears it for null', async () => {
    setActiveOfflineGroup('g-42');
    setActiveOfflineGroup(null);
    await expect(asyncStorageQueueStore.currentGroupId()).resolves.toBeNull();
  });
});
