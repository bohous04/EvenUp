/**
 * Recurring-expense scheduling (PRD FR-12.1). Pure date math — `now` is always
 * passed in (core never reads the wall clock), so this is fully deterministic
 * and testable. All arithmetic is in UTC to avoid timezone drift.
 */

export const RECURRENCE_INTERVALS = ['daily', 'weekly', 'monthly', 'yearly'] as const;
export type RecurrenceInterval = (typeof RECURRENCE_INTERVALS)[number];

function assertValidDate(date: Date, label: string): void {
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`${label} is not a valid date`);
  }
}

/** Advance a date by `count` of the given interval (UTC). */
export function addInterval(date: Date, interval: RecurrenceInterval, count: number): Date {
  assertValidDate(date, 'date');
  const r = new Date(date.getTime());
  switch (interval) {
    case 'daily':
      r.setUTCDate(r.getUTCDate() + count);
      break;
    case 'weekly':
      r.setUTCDate(r.getUTCDate() + 7 * count);
      break;
    case 'monthly':
      r.setUTCMonth(r.getUTCMonth() + count);
      break;
    case 'yearly':
      r.setUTCFullYear(r.getUTCFullYear() + count);
      break;
  }
  return r;
}

export interface DueOccurrencesInput {
  /** Date of the original (template) expense. */
  readonly anchor: Date;
  readonly interval: RecurrenceInterval;
  /** Last occurrence already materialized; defaults to the anchor. */
  readonly lastRun?: Date | null;
  /** "Current" time — passed in by the caller. */
  readonly now: Date;
  /** Safety cap on the number of occurrences returned (default 366). */
  readonly maxCount?: number;
}

/**
 * Occurrence dates that fall strictly after `lastRun` (or the anchor) and on or
 * before `now`. Occurrences step from the anchor by the interval.
 */
export function dueOccurrences(input: DueOccurrencesInput): Date[] {
  const { anchor, interval, now } = input;
  assertValidDate(anchor, 'anchor');
  assertValidDate(now, 'now');
  const cursor = input.lastRun ?? anchor;
  assertValidDate(cursor, 'lastRun');
  const maxCount = input.maxCount ?? 366;

  const due: Date[] = [];
  for (let k = 1; due.length < maxCount; k++) {
    const occurrence = addInterval(anchor, interval, k);
    if (occurrence.getTime() > now.getTime()) break;
    if (occurrence.getTime() > cursor.getTime()) due.push(occurrence);
  }
  return due;
}
