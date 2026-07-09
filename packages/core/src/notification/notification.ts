/**
 * Notification scheduling primitives (PRD FR-11.1, FR-11.2).
 *
 * Pure date and set math — `now` is always passed in, so digest windows and
 * idempotency keys are fully deterministic and testable. No wall clock, no I/O.
 *
 * Idempotency keys are the whole reliability story of the notification spine:
 * they are written to a UNIQUE column before a send is attempted, so a cron run
 * that crashes and is retried cannot deliver the same message twice.
 */

export const DEFAULT_DIGEST_INTERVAL_HOURS = 24;
export const DEFAULT_REMINDER_INTERVAL_HOURS = 168; // weekly
/** Debts below this (in the group's base currency) are not worth an email. */
export const DEFAULT_REMINDER_THRESHOLD_MINOR_UNITS = 5_000;

const HOUR_MS = 3_600_000;

export const NOTIFICATION_KINDS = [
  'digest',
  'reminder',
  'settlement.received',
  'group.added',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

function assertValidDate(date: Date, label: string): void {
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`${label} is not a valid date`);
  }
}

function assertPositiveInterval(intervalHours: number): void {
  if (!Number.isFinite(intervalHours) || intervalHours <= 0) {
    throw new RangeError(`intervalHours must be a positive number, got ${intervalHours}`);
  }
}

export interface DigestDueInput {
  /**
   * When this user last received a digest for this group. `null` means the
   * preference row does not exist yet: such a user is *initialized* to `now` by
   * the caller rather than mailed the group's entire history, so they are never
   * "due".
   */
  readonly lastDigestAt: Date | null;
  readonly now: Date;
  readonly intervalHours?: number;
}

/** Whether a full digest interval has elapsed since the last one was sent. */
export function isDigestDue(input: DigestDueInput): boolean {
  assertValidDate(input.now, 'now');
  const intervalHours = input.intervalHours ?? DEFAULT_DIGEST_INTERVAL_HOURS;
  assertPositiveInterval(intervalHours);
  if (input.lastDigestAt === null) return false;
  assertValidDate(input.lastDigestAt, 'lastDigestAt');
  return input.now.getTime() - input.lastDigestAt.getTime() >= intervalHours * HOUR_MS;
}

/**
 * Start of the interval bucket containing `now`, measured from the Unix epoch.
 * Two calls anywhere inside the same bucket return the same instant, which is
 * what makes a digest idempotency key stable for the duration of its window.
 */
export function windowStart(now: Date, intervalHours: number): Date {
  assertValidDate(now, 'now');
  assertPositiveInterval(intervalHours);
  const bucketMs = intervalHours * HOUR_MS;
  return new Date(Math.floor(now.getTime() / bucketMs) * bucketMs);
}

export interface ActivityEvent {
  readonly action: string;
  /** `null` for system-generated events (e.g. materialized recurring expenses). */
  readonly actorId: string | null;
  readonly createdAt: Date;
}

export interface DigestItem {
  readonly action: string;
  readonly count: number;
  /** Timestamp of the most recent event of this action. */
  readonly lastAt: Date;
}

export interface CoalesceOptions {
  /**
   * Drop events this actor caused — you are not mailed about your own expense.
   * `null` excludes nothing; system events (actor `null`) are always kept, since
   * nobody caused them.
   */
  readonly excludeActorId?: string | null;
}

/** Collapse an activity stream into per-action counts, most recent action first. */
export function coalesceDigest(
  events: readonly ActivityEvent[],
  options: CoalesceOptions = {},
): DigestItem[] {
  const exclude = options.excludeActorId ?? null;
  const byAction = new Map<string, { count: number; lastAt: Date }>();

  for (const event of events) {
    if (exclude !== null && event.actorId === exclude) continue;
    assertValidDate(event.createdAt, 'createdAt');
    const existing = byAction.get(event.action);
    if (!existing) {
      byAction.set(event.action, { count: 1, lastAt: event.createdAt });
      continue;
    }
    existing.count++;
    if (event.createdAt.getTime() > existing.lastAt.getTime()) existing.lastAt = event.createdAt;
  }

  return [...byAction.entries()]
    .map(([action, { count, lastAt }]) => ({ action, count, lastAt }))
    .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
}

export interface ReminderPayment {
  readonly fromMemberId: string;
  readonly toMemberId: string;
  readonly amountMinorUnits: number;
}

/**
 * Debts worth an email: at or above the threshold, and never zero. A settled
 * group produces zero-amount payments, and nagging someone over 3 Kč is how you
 * teach them to mute you.
 */
export function reminderPayments<T extends ReminderPayment>(
  payments: readonly T[],
  thresholdMinorUnits: number,
): T[] {
  if (!Number.isFinite(thresholdMinorUnits) || thresholdMinorUnits < 0) {
    throw new RangeError(`threshold must be a non-negative number, got ${thresholdMinorUnits}`);
  }
  const floor = Math.max(thresholdMinorUnits, 1);
  return payments.filter((p) => p.amountMinorUnits >= floor);
}

/** `digest:<userId>:<groupId>:<windowStartMs>` — at most one digest per window. */
export function digestIdempotencyKey(
  userId: string,
  groupId: string,
  now: Date,
  intervalHours: number = DEFAULT_DIGEST_INTERVAL_HOURS,
): string {
  return `digest:${userId}:${groupId}:${windowStart(now, intervalHours).getTime()}`;
}

/** At most one reminder per debtor, per creditor, per window. */
export function reminderIdempotencyKey(
  userId: string,
  groupId: string,
  creditorMemberId: string,
  now: Date,
  intervalHours: number = DEFAULT_REMINDER_INTERVAL_HOURS,
): string {
  const bucket = windowStart(now, intervalHours).getTime();
  return `reminder:${userId}:${groupId}:${creditorMemberId}:${bucket}`;
}

/** One notification per settlement transaction, forever. */
export function settlementIdempotencyKey(userId: string, transactionId: string): string {
  return `settlement.received:${userId}:${transactionId}`;
}

/**
 * Keyed on the member row, not the (user, group) pair: someone removed from a
 * group and re-added gets a fresh member row, and should be told again.
 */
export function groupAddedIdempotencyKey(memberId: string): string {
  return `group.added:${memberId}`;
}
