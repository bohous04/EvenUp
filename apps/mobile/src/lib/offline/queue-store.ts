/**
 * The Expo app's offline queue storage — AsyncStorage.
 *
 * The same `OfflineQueueStore` the PWA implements over IndexedDB, so both
 * clients drive the identical `drainQueue` from `@evenup/core`. The policy is
 * the part that decides battery behaviour; keeping exactly one copy of it is
 * what stops the two apps drifting into different retry habits.
 *
 * As on the web, every operation is **best-effort**: a full disk or a
 * restricted environment must degrade to "no offline queue", never to a crash
 * on the expense path. A failed write is swallowed and the caller sends the
 * expense directly instead — losing the offline feature beats losing the
 * expense.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OfflineQueueItem, OfflineQueueStore } from '@evenup/core';

const QUEUE_KEY = 'evenup.offline.expense-queue.v1';
const ACTIVE_GROUP_KEY = 'evenup.offline.active-group.v1';

/**
 * A stored item is untrusted on the way back in: a schema change between app
 * versions, or a half-written record, must not hand the rest of the app an
 * object it will crash on. Anything that does not look like a queue item is
 * dropped rather than surfaced.
 */
function parseQueue(raw: string | null): OfflineQueueItem[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (i): i is OfflineQueueItem =>
      typeof i === 'object' &&
      i !== null &&
      typeof (i as OfflineQueueItem).id === 'string' &&
      typeof (i as OfflineQueueItem).groupId === 'string' &&
      typeof (i as OfflineQueueItem).createdAt === 'number' &&
      typeof (i as OfflineQueueItem).attempts === 'number' &&
      typeof (i as OfflineQueueItem).nextAttemptAt === 'number' &&
      typeof (i as OfflineQueueItem).payload === 'object',
  );
}

let activeGroupId: string | null = null;

export function setActiveOfflineGroup(groupId: string | null): void {
  activeGroupId = groupId;
  void AsyncStorage.setItem(ACTIVE_GROUP_KEY, groupId ?? '').catch(() => {
    /* best effort: the queue still works, it just cannot be scoped */
  });
}

export const asyncStorageQueueStore: OfflineQueueStore = {
  async read(): Promise<OfflineQueueItem[]> {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      return parseQueue(raw).sort((a, b) => a.createdAt - b.createdAt);
    } catch {
      return [];
    }
  },

  async write(items: readonly OfflineQueueItem[]): Promise<void> {
    try {
      // `setItem` is a single operation, so unlike the IndexedDB adapter there
      // is no clear-then-write window to lose data through.
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
    } catch {
      // Swallowed deliberately — see the module comment.
    }
  },

  async currentGroupId(): Promise<string | null> {
    if (activeGroupId !== null) return activeGroupId;
    try {
      const stored = await AsyncStorage.getItem(ACTIVE_GROUP_KEY);
      activeGroupId = stored || null;
      return activeGroupId;
    } catch {
      return null;
    }
  },
};
