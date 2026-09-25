/**
 * The offline queue's storage contract and its one shared runner.
 *
 * Two clients, one policy: the PWA persists to IndexedDB, the Expo app to
 * AsyncStorage, and both drive the *same* `drainQueue` — because a second
 * implementation is a second set of bugs, and the failure mode here (a queue
 * that retries too eagerly) is invisible until a user's battery is flat.
 *
 * The interface is deliberately tiny — read the whole queue, write the whole
 * queue. An offline queue for expenses is a handful of items, so incremental
 * mutations would buy nothing and cost two adapters' worth of subtle code.
 * A bulk write is also atomic from the caller's point of view: a crash
 * mid-write cannot leave half an item's state behind.
 */
import {
  claimDue,
  markFailed,
  markSucceeded,
  pendingCount,
  type OfflineQueueItem,
  type SyncOptions,
} from './sync-policy.js';

/** Where a client keeps its queue. Implemented per platform, not per policy. */
export interface OfflineQueueStore {
  /** All items, or `[]` when the client has never queued anything. */
  read(): Promise<OfflineQueueItem[]>;
  /** Replace the whole queue. */
  write(items: readonly OfflineQueueItem[]): Promise<void>;
  /** The group the user is currently looking at, or `null` if unknown. */
  currentGroupId(): Promise<string | null>;
}

/**
 * Sends one queued expense. The client supplies the real tRPC call; the
 * runner knows nothing about tRPC.
 *
 * Throwing signals "did not land" and is fed back as a retry. Returning
 * resolves the item — including a server-side *business* rejection, which is
 * what the idempotency short-circuit produces, so a retried item resolves
 * rather than looping.
 */
export type SendQueuedExpense = (item: OfflineQueueItem) => Promise<void>;

/** What one drain achieved, for the caller to log or surface. */
export interface DrainResult {
  /** Items removed because they landed. */
  readonly sent: number;
  /** Items that failed and were rescheduled. */
  readonly failed: number;
  /** Items still waiting — including any not yet due, or a second batch. */
  readonly remaining: number;
  /** Items that used up their attempts and now need the user. */
  readonly stuck: number;
}

/**
 * Injected for determinism, exactly as the policy takes `random`. A real host
 * passes `Date.now` and `Math.random`; a test passes values it controls.
 */
export interface SyncEnvironment {
  now(): number;
  random(): number;
  /** `expo-network` in the app, `navigator.onLine` on the web. */
  isOnline(): boolean | Promise<boolean>;
}

const defaultEnv: SyncEnvironment = {
  now: () => Date.now(),
  random: () => Math.random(),
  isOnline: () => true,
};

/**
 * Send at most one batch of due items.
 *
 * **Event-driven by design** — the host decides *when* to call this (app
 * foreground, connectivity regained), and this function contains no timer. A
 * polling loop is the single easiest way to drain a battery, so the module
 * offers no way to express one.
 *
 * `isOnline` is consulted but is not trusted on its own: a captive portal or a
 * dead cell connection reports a network and fails every request. That is why
 * failure drives the backoff rather than connectivity state — the signal is
 * the failure, not the flag.
 */
export async function drainQueue(
  store: OfflineQueueStore,
  send: SendQueuedExpense,
  env: SyncEnvironment = defaultEnv,
  options: SyncOptions = {},
): Promise<DrainResult> {
  if (!(await env.isOnline())) {
    // Nothing to do, and — importantly — nothing *tried*. Firing requests at
    // a network that reports itself up is what makes a dead connection expensive.
    const queue = await store.read();
    return {
      sent: 0,
      failed: 0,
      remaining: pendingCount(queue, options),
      stuck: queue.length - pendingCount(queue, options),
    };
  }

  const now = env.now();
  let queue = await store.read();
  const batch = claimDue(queue, now, options);
  let sent = 0;
  let failed = 0;

  for (const item of batch) {
    try {
      await send(item);
      queue = markSucceeded(queue, item.id);
      sent += 1;
    } catch (err) {
      queue = markFailed(
        queue,
        item.id,
        err instanceof Error ? err.message : String(err),
        env.now(),
        env.random(),
        options,
      );
      failed += 1;
    }
  }

  if (sent > 0 || failed > 0) await store.write(queue);

  return {
    sent,
    failed,
    remaining: pendingCount(queue, options),
    stuck: queue.length - pendingCount(queue, options),
  };
}
