import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import {
  drainQueue,
  pendingCount,
  type OfflineQueueItem,
  type OfflineQueueStore,
  type SyncEnvironment,
} from '@evenup/core';
import { asyncStorageQueueStore, setActiveOfflineGroup } from './queue-store';

/**
 * The Expo counterpart of the web's `useExpenseQueue`.
 *
 * **Same policy, same guarantees, different lifecycle events.** The decisions —
 * when to retry, how long to wait, how many at once, when to give up — all come
 * from `drainQueue` in `@evenup/core`, so the two clients cannot drift into
 * different battery behaviour. What differs here is only *when to ask*:
 *
 *   - **app returning to the foreground**, via `AppState` — the moment a
 *     queued expense is most likely to be sendable;
 *   - **the network coming back**, via `expo-network`.
 *
 * There is no interval, for the same reason as on the web: a wakeup on a
 * schedule costs battery whether or not anything is queued.
 *
 * `expo-network` is consulted for the *trigger* but the runner still backs off
 * on failure, because a reported connection also means a captive portal.
 */
export interface UseExpenseQueueOptions {
  send: (item: OfflineQueueItem) => Promise<void>;
  store?: OfflineQueueStore;
  onSynced?: () => void;
}

/** The environment the shared runner is driven with; injectable for tests. */
const realEnv: SyncEnvironment = {
  now: () => Date.now(),
  random: () => Math.random(),
  isOnline: async () => {
    try {
      const state = await Network.getNetworkStateAsync();
      // `isInternetReachable` is null while it is still being determined, so a
      // null is treated as reachable: the runner backs off on a real failure
      // anyway, and refusing to send on an unknown would strand the queue.
      return state.isInternetReachable !== false;
    } catch {
      return true;
    }
  },
};

export function useExpenseQueue({ send, store, onSynced }: UseExpenseQueueOptions) {
  const queueStore = store ?? asyncStorageQueueStore;
  const [pending, setPending] = useState(0);
  // Stuck items are kept whole, not counted: the badge has to name them, and an
  // expense the user watched disappear is the worst outcome here.
  const [stuck, setStuck] = useState<{ id: string; title: string }[]>([]);

  const drainAgain = useRef(false);
  const inFlight = useRef<Promise<void> | null>(null);

  const sendRef = useRef(send);
  sendRef.current = send;
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;
  const storeRef = useRef(queueStore);
  storeRef.current = queueStore;

  const refreshCounts = useCallback(async () => {
    const queue = await storeRef.current.read();
    const stuckItems = queue.filter((i) => !pendingCount([i]));
    setPending(pendingCount(queue));
    setStuck(stuckItems.map((i) => ({ id: i.id, title: String(i.payload?.title ?? '—') })));
  }, []);

  /**
   * One batch at a time, and a caller that awaits this waits for the pass that
   * will handle *its* item. Returning early from a deferred call is what made
   * the web version report a landed expense as "still waiting" — the same
   * guard is here for the same reason.
   */
  const drain = useCallback((): Promise<void> => {
    if (inFlight.current) {
      // Something arrived mid-drain; loop again rather than waiting for the
      // next lifecycle event, which could be a long way off.
      drainAgain.current = true;
      return inFlight.current;
    }
    const run = (async () => {
      do {
        drainAgain.current = false;
        const result = await drainQueue(storeRef.current, (item) => sendRef.current(item), realEnv);
        if (result.sent > 0) onSyncedRef.current?.();
        await refreshCounts();
      } while (drainAgain.current);
    })().finally(() => {
      inFlight.current = null;
    });
    inFlight.current = run;
    return run;
  }, [refreshCounts]);

  /** Write the expense down first, then send. See the web hook for why. */
  const enqueue = useCallback(
    async (groupId: string, payload: Record<string, unknown>): Promise<boolean> => {
      const id = `q-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const item: OfflineQueueItem = {
        id,
        groupId,
        payload,
        createdAt: Date.now(),
        attempts: 0,
        nextAttemptAt: Date.now(),
      };
      const queue = await storeRef.current.read();
      await storeRef.current.write([...queue, item]);
      setActiveOfflineGroup(groupId);
      await refreshCounts();
      await drain();
      const after = await storeRef.current.read();
      return !after.some((i) => i.id === id);
    },
    [drain, refreshCounts],
  );

  const discard = useCallback(
    async (id: string) => {
      const queue = await storeRef.current.read();
      await storeRef.current.write(queue.filter((i) => i.id !== id));
      await refreshCounts();
    },
    [refreshCounts],
  );

  useEffect(() => {
    void refreshCounts();
    void drain();

    // Foreground: the user has just done something, so a queued expense is
    // most likely to be sendable now.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void drain();
    });
    // Network regained. The runner still backs off on failure — a reported
    // connection is not a working one.
    const netSub = Network.addNetworkStateListener((state) => {
      if (state.isInternetReachable !== false) void drain();
    });
    return () => {
      sub.remove();
      netSub.remove();
    };
  }, [drain, refreshCounts]);

  return { enqueue, drain, discard, pending, stuck };
}
