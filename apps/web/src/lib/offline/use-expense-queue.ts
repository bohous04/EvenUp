'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { drainQueue, pendingCount, type OfflineQueueItem } from '@evenup/core';
import { indexedDbQueueStore, setActiveOfflineGroup } from './queue-store';

/**
 * Ties the offline queue to the browser's lifecycle.
 *
 * **The expense is written to the queue first, then sent.** That order is the
 * whole point: if the app is killed between "user pressed save" and "the
 * request reached the server", the expense is still on disk and will be sent
 * on the next foreground. Doing it the other way round — send, and queue only
 * on failure — leaves exactly that window unprotected, and a trip through a
 * tunnel is where it gets exercised.
 *
 * **Draining is event-driven, never polled.** Three events, and that is all:
 * coming back to the tab, the browser reporting the network is back, and the
 * moment an expense is saved. A `setInterval` would wake the radio on a
 * schedule whether or not anything was queued, which is precisely the cost
 * this feature is supposed to avoid.
 *
 * The retry policy itself — jittered backoff, batching, the attempt budget —
 * lives in `@evenup/core` and is shared with the Expo app. Nothing here decides
 * *when* to retry; it only decides *when to ask*.
 */
export interface UseExpenseQueueOptions {
  /** Sends one queued expense. Resolves when it is on the server. */
  send: (item: OfflineQueueItem) => Promise<void>;
  /** Notified after any drain that landed something, so the caller can refetch. */
  onSynced?: () => void;
}

export function useExpenseQueue({ send, onSynced }: UseExpenseQueueOptions) {
  const [pending, setPending] = useState(0);
  const [stuck, setStuck] = useState(0);
  const sending = useRef(false);
  // Held in a ref so changing the caller's identity (a new arrow function
  // every render) does not re-subscribe the listeners on every render.
  const sendRef = useRef(send);
  sendRef.current = send;
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;

  const refreshCounts = useCallback(async () => {
    const queue = await indexedDbQueueStore.read();
    setPending(pendingCount(queue));
    setStuck(queue.length - pendingCount(queue));
  }, []);

  /**
   * One batch, guarded against overlap. Two drains racing would both read the
   * queue, both send the same items, and the second would overwrite the first's
   * write — losing whatever the first had already removed.
   */
  const drain = useCallback(async () => {
    if (sending.current) return;
    sending.current = true;
    try {
      const result = await drainQueue(indexedDbQueueStore, (item) => sendRef.current(item), {
        now: () => Date.now(),
        random: () => Math.random(),
        isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine),
      });
      setPending(result.remaining);
      setStuck(result.stuck);
      if (result.sent > 0) onSyncedRef.current?.();
    } finally {
      sending.current = false;
    }
  }, []);

  /**
   * Save an expense: durable first, then sent. Returns whether it landed
   * immediately, so the caller can decide between "saved" and "saved, will send
   * when you're back online" without inspecting the queue itself.
   */
  const enqueue = useCallback(
    async (groupId: string, payload: Record<string, unknown>): Promise<boolean> => {
      // The id is the `clientMutationId`, so a retry is idempotent by
      // construction. crypto.randomUUID is unavailable on insecure origins,
      // which a self-hosted instance behind plain HTTP is.
      const id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `q-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      const item: OfflineQueueItem = {
        id,
        groupId,
        payload,
        createdAt: Date.now(),
        attempts: 0,
        nextAttemptAt: Date.now(),
      };
      const queue = await indexedDbQueueStore.read();
      await indexedDbQueueStore.write([...queue, item]);
      setActiveOfflineGroup(groupId);
      await refreshCounts();
      // Awaited, not `void`ed: the return value answers "did this one land?",
      // and a fire-and-forget drain has not finished when we ask. The overlap
      // guard in `drain` makes awaiting safe.
      await drain();
      // Whether this specific one landed: still in the queue means it did not.
      const after = await indexedDbQueueStore.read();
      return !after.some((i) => i.id === id);
    },
    [drain, refreshCounts],
  );

  /** Drop an item the user has given up on, so the badge clears. */
  const discard = useCallback(
    async (id: string) => {
      const queue = await indexedDbQueueStore.read();
      await indexedDbQueueStore.write(queue.filter((i) => i.id !== id));
      await refreshCounts();
    },
    [refreshCounts],
  );

  useEffect(() => {
    void refreshCounts();
    void drain();

    // Back to this tab: the user has just done something in the app, and it is
    // the most likely moment for a queued expense to be sendable.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void drain();
    };
    // The browser saying the network is back. Note the drain still backs off on
    // failure, because "online" also means captive portal.
    const onOnline = () => void drain();

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [drain, refreshCounts]);

  return { enqueue, drain, discard, pending, stuck };
}
