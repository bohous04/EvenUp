import { describe, expect, test } from 'vitest';
import * as fc from 'fast-check';
import {
  DEFAULT_DIGEST_INTERVAL_HOURS,
  DEFAULT_REMINDER_INTERVAL_HOURS,
  DEFAULT_REMINDER_THRESHOLD_MINOR_UNITS,
  coalesceDigest,
  digestIdempotencyKey,
  isDigestDue,
  reminderIdempotencyKey,
  reminderPayments,
  settlementIdempotencyKey,
  windowStart,
  type ActivityEvent,
} from './notification.js';

const d = (iso: string) => new Date(iso);

const event = (action: string, actorId: string | null, at: string): ActivityEvent => ({
  action,
  actorId,
  createdAt: d(at),
});

describe('isDigestDue', () => {
  test('a user with no watermark is never due (they are initialized, not digested)', () => {
    expect(isDigestDue({ lastDigestAt: null, now: d('2026-07-09T12:00:00Z') })).toBe(false);
  });

  test('due once the full interval has elapsed', () => {
    const lastDigestAt = d('2026-07-08T12:00:00Z');
    expect(isDigestDue({ lastDigestAt, now: d('2026-07-09T11:59:59Z') })).toBe(false);
    expect(isDigestDue({ lastDigestAt, now: d('2026-07-09T12:00:00Z') })).toBe(true);
    expect(isDigestDue({ lastDigestAt, now: d('2026-07-10T00:00:00Z') })).toBe(true);
  });

  test('honors a custom interval', () => {
    const lastDigestAt = d('2026-07-09T12:00:00Z');
    expect(isDigestDue({ lastDigestAt, now: d('2026-07-09T13:00:00Z'), intervalHours: 6 })).toBe(
      false,
    );
    expect(isDigestDue({ lastDigestAt, now: d('2026-07-09T18:00:00Z'), intervalHours: 6 })).toBe(
      true,
    );
  });

  test('a clock that runs backwards never reports due', () => {
    expect(
      isDigestDue({ lastDigestAt: d('2026-07-09T12:00:00Z'), now: d('2026-07-01T00:00:00Z') }),
    ).toBe(false);
  });

  test('property: once due, staying later keeps it due', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (elapsedMs, extraMs) => {
          const lastDigestAt = d('2026-01-01T00:00:00Z');
          const now = new Date(lastDigestAt.getTime() + elapsedMs);
          const later = new Date(now.getTime() + extraMs);
          if (isDigestDue({ lastDigestAt, now })) {
            expect(isDigestDue({ lastDigestAt, now: later })).toBe(true);
          }
        },
      ),
    );
  });

  test('rejects invalid dates', () => {
    expect(() => isDigestDue({ lastDigestAt: new Date(NaN), now: d('2026-01-01') })).toThrow(
      TypeError,
    );
    expect(() => isDigestDue({ lastDigestAt: null, now: new Date(NaN) })).toThrow(TypeError);
  });
});

describe('coalesceDigest', () => {
  const events: ActivityEvent[] = [
    event('expense.created', 'u1', '2026-07-09T09:00:00Z'),
    event('expense.created', 'u2', '2026-07-09T10:00:00Z'),
    event('expense.created', 'u2', '2026-07-09T11:00:00Z'),
    event('member.added', 'u1', '2026-07-09T08:00:00Z'),
  ];

  test('groups by action with counts and the latest timestamp', () => {
    const items = coalesceDigest(events);
    expect(items).toEqual([
      { action: 'expense.created', count: 3, lastAt: d('2026-07-09T11:00:00Z') },
      { action: 'member.added', count: 1, lastAt: d('2026-07-09T08:00:00Z') },
    ]);
  });

  test('excludes the recipient own events', () => {
    const items = coalesceDigest(events, { excludeActorId: 'u2' });
    expect(items).toEqual([
      { action: 'expense.created', count: 1, lastAt: d('2026-07-09T09:00:00Z') },
      { action: 'member.added', count: 1, lastAt: d('2026-07-09T08:00:00Z') },
    ]);
  });

  test('an actor who caused everything gets an empty digest', () => {
    expect(coalesceDigest(events, { excludeActorId: 'u1' })).not.toHaveLength(0);
    expect(
      coalesceDigest([event('expense.created', 'u1', '2026-07-09T09:00:00Z')], {
        excludeActorId: 'u1',
      }),
    ).toEqual([]);
  });

  test('system events (null actor) are never excluded', () => {
    const systemOnly = [event('expense.created', null, '2026-07-09T09:00:00Z')];
    expect(coalesceDigest(systemOnly, { excludeActorId: 'u1' })).toHaveLength(1);
    // `excludeActorId: null` must not swallow system events by matching null === null.
    expect(coalesceDigest(systemOnly, { excludeActorId: null })).toHaveLength(1);
  });

  test('orders actions by most-recent activity first', () => {
    const items = coalesceDigest([
      event('b', 'u1', '2026-07-09T01:00:00Z'),
      event('a', 'u1', '2026-07-09T02:00:00Z'),
    ]);
    expect(items.map((i) => i.action)).toEqual(['a', 'b']);
  });

  test('property: counts sum to the number of non-excluded events', () => {
    const actorArb = fc.constantFrom<string | null>('u1', 'u2', null);
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            action: fc.constantFrom('expense.created', 'member.added', 'group.updated'),
            actorId: actorArb,
            createdAt: fc
              .integer({ min: 0, max: 86_400_000 })
              .map((ms) => new Date(1_760_000_000_000 + ms)),
          }),
          { maxLength: 50 },
        ),
        actorArb,
        (evts, excludeActorId) => {
          const items = coalesceDigest(evts, { excludeActorId });
          const total = items.reduce((sum, i) => sum + i.count, 0);
          const expected = evts.filter(
            (e) => excludeActorId === null || e.actorId !== excludeActorId,
          ).length;
          expect(total).toBe(expected);
        },
      ),
    );
  });
});

describe('reminderPayments', () => {
  const payments = [
    { fromMemberId: 'a', toMemberId: 'b', amountMinorUnits: 10_000 },
    { fromMemberId: 'c', toMemberId: 'b', amountMinorUnits: 300 },
    { fromMemberId: 'd', toMemberId: 'a', amountMinorUnits: 5_000 },
  ];

  test('keeps only payments at or above the threshold', () => {
    expect(reminderPayments(payments, 5_000).map((p) => p.fromMemberId)).toEqual(['a', 'd']);
  });

  test('a zero threshold keeps everything except zero-amount payments', () => {
    expect(
      reminderPayments(
        [...payments, { fromMemberId: 'z', toMemberId: 'b', amountMinorUnits: 0 }],
        0,
      ),
    ).toHaveLength(3);
  });

  test('property: the result is a subset, all at or above threshold', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            fromMemberId: fc.string({ minLength: 1 }),
            toMemberId: fc.string({ minLength: 1 }),
            amountMinorUnits: fc.integer({ min: 0, max: 1_000_000 }),
          }),
        ),
        fc.integer({ min: 0, max: 100_000 }),
        (ps, threshold) => {
          const kept = reminderPayments(ps, threshold);
          expect(kept.length).toBeLessThanOrEqual(ps.length);
          for (const p of kept) {
            expect(p.amountMinorUnits).toBeGreaterThanOrEqual(Math.max(threshold, 1));
          }
        },
      ),
    );
  });

  test('rejects a negative threshold', () => {
    expect(() => reminderPayments(payments, -1)).toThrow(RangeError);
  });
});

describe('windowStart', () => {
  test('floors to the interval bucket', () => {
    expect(windowStart(d('2026-07-09T13:37:00Z'), 24).toISOString()).toBe(
      '2026-07-09T00:00:00.000Z',
    );
    expect(windowStart(d('2026-07-09T13:37:00Z'), 6).toISOString()).toBe(
      '2026-07-09T12:00:00.000Z',
    );
  });

  test('is stable across the whole bucket', () => {
    const a = windowStart(d('2026-07-09T00:00:00Z'), 24);
    const b = windowStart(d('2026-07-09T23:59:59Z'), 24);
    expect(a.getTime()).toBe(b.getTime());
  });

  test('rejects a non-positive interval', () => {
    expect(() => windowStart(d('2026-07-09T00:00:00Z'), 0)).toThrow(RangeError);
  });
});

describe('idempotency keys', () => {
  const at = d('2026-07-09T13:37:00Z');

  test('digest keys are stable within a window and differ across windows', () => {
    const k1 = digestIdempotencyKey('u1', 'g1', at, 24);
    const k2 = digestIdempotencyKey('u1', 'g1', d('2026-07-09T23:00:00Z'), 24);
    const k3 = digestIdempotencyKey('u1', 'g1', d('2026-07-10T00:00:00Z'), 24);
    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
    expect(k1.startsWith('digest:')).toBe(true);
  });

  test('digest keys separate users and groups', () => {
    expect(digestIdempotencyKey('u1', 'g1', at, 24)).not.toBe(
      digestIdempotencyKey('u2', 'g1', at, 24),
    );
    expect(digestIdempotencyKey('u1', 'g1', at, 24)).not.toBe(
      digestIdempotencyKey('u1', 'g2', at, 24),
    );
  });

  test('reminder keys are per creditor per window', () => {
    const k1 = reminderIdempotencyKey('u1', 'g1', 'm-creditor', at, 168);
    const k2 = reminderIdempotencyKey('u1', 'g1', 'm-other', at, 168);
    expect(k1).not.toBe(k2);
    expect(k1.startsWith('reminder:')).toBe(true);
  });

  test('the settlement key is naturally unique — one notification per transaction, forever', () => {
    expect(settlementIdempotencyKey('u1', 'tx1')).toBe('settlement.received:u1:tx1');
    expect(settlementIdempotencyKey('u1', 'tx1')).not.toBe(settlementIdempotencyKey('u2', 'tx1'));
  });
});

describe('defaults', () => {
  test('match the spec', () => {
    expect(DEFAULT_DIGEST_INTERVAL_HOURS).toBe(24);
    expect(DEFAULT_REMINDER_INTERVAL_HOURS).toBe(168);
    expect(DEFAULT_REMINDER_THRESHOLD_MINOR_UNITS).toBe(5_000);
  });
});
