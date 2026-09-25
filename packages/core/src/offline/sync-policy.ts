/**
 * The offline sync policy — pure decision logic, no I/O, no platform APIs.
 *
 * This is the part that decides whether a queue is polite to a phone battery.
 * It lives in `@evenup/core` because both clients must agree on it exactly,
 * and because it is pure enough to test deterministically — the 95% coverage
 * gate applies to it like the rest of core.
 *
 * **Why a policy module at all.** A naive queue — "try again every 30 seconds,
 * send everything" — is a small amount of code that quietly drains a phone.
 * Three specific ways, all handled here:
 *
 *   1. **A timer instead of events.** Waking on an interval costs a wakeup
 *      whether or not there is anything to send. So this module exposes no
 *      scheduling at all: it answers "given this queue and this instant, what
 *      should I send?" and the host decides when to ask. The hosts ask on
 *      app foreground and on connectivity change, never on a tick.
 *
 *   2. **The thundering herd.** Everyone who lost signal in the same place
 *      regains it in the same second. Without jitter they all retry in the
 *      same millisecond, which pins the radio on. So the delay is *full
 *      jitter* — a random point under an exponentially-growing ceiling — and
 *      the cap bounds how long a long outage can push the next attempt out.
 *
 *   3. **Retrying forever.** An item the server will never accept (a deleted
 *      group, a member removed overnight) must stop and surface for the user
 *      rather than burn attempts until the app is uninstalled.
 *
 * `random` is a **parameter**. That is what makes "two queues do not sync in
 * lockstep" an assertion instead of a hope, and it keeps the tests
 * deterministic — the same seam `resolveRateDecimal` uses for its fetch.
 */

/** One queued expense, persisted by the client until it lands. */
export interface OfflineQueueItem {
  /**
   * The `clientMutationId` sent to the server. Doubles as the queue's own
   * primary key, so a retry is idempotent by construction — see
   * `transaction.createExpense`.
   */
  readonly id: string;
  readonly groupId: string;
  /** Whatever `transaction.createExpense` takes, minus the two queue fields. */
  readonly payload: Readonly<Record<string, unknown>>;
  /** When the user recorded it. Drives FIFO order, not the id. */
  readonly createdAt: number;
  /** Failed attempts so far. */
  readonly attempts: number;
  /** Epoch ms before which this item must not be attempted. */
  readonly nextAttemptAt: number;
  /** Last server/transport error, for display. */
  readonly lastError?: string;
}

export interface SyncOptions {
  /** Delay before the first retry, before jitter. */
  readonly baseDelayMs?: number;
  /** Ceiling for the growth, and for the jittered result. */
  readonly maxDelayMs?: number;
  /** After this many failed attempts an item stops and needs the user. */
  readonly maxAttempts?: number;
  /** Most items sent in one burst. */
  readonly batchSize?: number;
}

export const SYNC_DEFAULTS = {
  baseDelayMs: 2_000,
  // Five minutes: long enough that a dead connection is not hammered, short
  // enough that a brief tunnel does not leave the queue stranded.
  maxDelayMs: 5 * 60_000,
  maxAttempts: 8,
  batchSize: 5,
} as const satisfies Required<SyncOptions>;

function resolve(options: SyncOptions): Required<SyncOptions> {
  return {
    baseDelayMs: options.baseDelayMs ?? SYNC_DEFAULTS.baseDelayMs,
    maxDelayMs: options.maxDelayMs ?? SYNC_DEFAULTS.maxDelayMs,
    maxAttempts: options.maxAttempts ?? SYNC_DEFAULTS.maxAttempts,
    batchSize: options.batchSize ?? SYNC_DEFAULTS.batchSize,
  };
}

/**
 * Delay before the next attempt, in ms.
 *
 * `2^(attempts-1)` growth, clamped to `maxDelayMs`, then **full jitter** over
 * `[0, ceiling]`. Jitter is not decoration: it is the difference between N
 * devices waking the radio in the same 50 ms and spreading the load across the
 * recovery window.
 *
 * `random` is a value in `[0, 1)`, not a function, so a test can pin it.
 */
export function backoffDelayMs(
  attempts: number,
  random: number,
  options: SyncOptions = {},
): number {
  const { baseDelayMs, maxDelayMs } = resolve(options);
  const growth = 2 ** Math.max(0, attempts - 1);
  const ceiling = Math.min(maxDelayMs, baseDelayMs * growth);
  // `random` is clamped because a caller passing exactly 1 would otherwise
  // produce a delay one step beyond the ceiling.
  const jittered = ceiling * Math.min(Math.max(random, 0), 1);
  return Math.max(1, Math.round(jittered));
}

/** True once an item has used its attempts and needs a person, not a retry. */
export function isTerminal(item: OfflineQueueItem, options: SyncOptions = {}): boolean {
  return item.attempts >= resolve(options).maxAttempts;
}

/**
 * The items to send right now: due, not terminally failed, oldest first, at
 * most one batch.
 *
 * Oldest-first is not cosmetic. Three expenses added on a trip should land in
 * the order they happened; otherwise balances are briefly wrong and the
 * activity feed reads out of sequence.
 */
export function claimDue(
  queue: readonly OfflineQueueItem[],
  now: number,
  options: SyncOptions = {},
): OfflineQueueItem[] {
  const { batchSize } = resolve(options);
  return queue
    .filter((i) => !isTerminal(i, options) && i.nextAttemptAt <= now)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .slice(0, batchSize);
}

/** The item is on the server; drop it. Unknown ids are a no-op, not a crash. */
export function markSucceeded(queue: readonly OfflineQueueItem[], id: string): OfflineQueueItem[] {
  return queue.filter((i) => i.id !== id);
}

/** Record a failed attempt and schedule the next one. Unknown ids are a no-op. */
export function markFailed(
  queue: readonly OfflineQueueItem[],
  id: string,
  error: string,
  now: number,
  random: number,
  options: SyncOptions = {},
): OfflineQueueItem[] {
  return queue.map((i) => {
    if (i.id !== id) return i;
    const attempts = i.attempts + 1;
    return {
      ...i,
      attempts,
      lastError: error,
      nextAttemptAt: now + backoffDelayMs(attempts, random, options),
    };
  });
}

/** How many items still have a chance of landing — what a badge should show. */
export function pendingCount(
  queue: readonly OfflineQueueItem[],
  options: SyncOptions = {},
): number {
  return queue.filter((i) => !isTerminal(i, options)).length;
}

/** Milliseconds until an item is next due. Never negative. */
export function nextDelayFor(item: OfflineQueueItem, now: number): number {
  return Math.max(0, item.nextAttemptAt - now);
}
