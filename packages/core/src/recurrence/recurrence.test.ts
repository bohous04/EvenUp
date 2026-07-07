import { describe, expect, test } from 'vitest';
import { addInterval, dueOccurrences, RECURRENCE_INTERVALS } from './recurrence.js';

const d = (iso: string) => new Date(iso);
const iso = (date: Date) => date.toISOString().slice(0, 10);

describe('addInterval', () => {
  test('advances by each interval', () => {
    expect(iso(addInterval(d('2026-01-01T00:00:00Z'), 'daily', 1))).toBe('2026-01-02');
    expect(iso(addInterval(d('2026-01-01T00:00:00Z'), 'weekly', 1))).toBe('2026-01-08');
    expect(iso(addInterval(d('2026-01-15T00:00:00Z'), 'monthly', 1))).toBe('2026-02-15');
    expect(iso(addInterval(d('2026-01-15T00:00:00Z'), 'yearly', 1))).toBe('2027-01-15');
  });

  test('multiplies by the count', () => {
    expect(iso(addInterval(d('2026-01-01T00:00:00Z'), 'weekly', 3))).toBe('2026-01-22');
  });
});

describe('dueOccurrences (FR-12.1)', () => {
  test('lists daily occurrences after the anchor up to now', () => {
    const due = dueOccurrences({
      anchor: d('2026-01-01T00:00:00Z'),
      interval: 'daily',
      now: d('2026-01-04T00:00:00Z'),
    });
    expect(due.map(iso)).toEqual(['2026-01-02', '2026-01-03', '2026-01-04']);
  });

  test('respects a lastRun cursor (only newer occurrences)', () => {
    const due = dueOccurrences({
      anchor: d('2026-01-01T00:00:00Z'),
      interval: 'daily',
      lastRun: d('2026-01-02T00:00:00Z'),
      now: d('2026-01-04T00:00:00Z'),
    });
    expect(due.map(iso)).toEqual(['2026-01-03', '2026-01-04']);
  });

  test('weekly skips dates not yet due', () => {
    const due = dueOccurrences({
      anchor: d('2026-01-01T00:00:00Z'),
      interval: 'weekly',
      now: d('2026-01-20T00:00:00Z'),
    });
    expect(due.map(iso)).toEqual(['2026-01-08', '2026-01-15']);
  });

  test('returns empty when nothing is due yet', () => {
    expect(
      dueOccurrences({
        anchor: d('2026-01-01T00:00:00Z'),
        interval: 'monthly',
        now: d('2026-01-15T00:00:00Z'),
      }),
    ).toEqual([]);
  });

  test('returns empty when the anchor is in the future', () => {
    expect(
      dueOccurrences({
        anchor: d('2026-06-01T00:00:00Z'),
        interval: 'daily',
        now: d('2026-01-01T00:00:00Z'),
      }),
    ).toEqual([]);
  });

  test('caps the number of generated occurrences', () => {
    const due = dueOccurrences({
      anchor: d('2000-01-01T00:00:00Z'),
      interval: 'daily',
      now: d('2026-01-01T00:00:00Z'),
      maxCount: 5,
    });
    expect(due).toHaveLength(5);
  });

  test('exposes the supported intervals', () => {
    expect(RECURRENCE_INTERVALS).toContain('monthly');
    expect(RECURRENCE_INTERVALS.length).toBeGreaterThanOrEqual(4);
  });

  test('throws on an invalid date', () => {
    expect(() =>
      dueOccurrences({ anchor: new Date('nope'), interval: 'daily', now: d('2026-01-01') }),
    ).toThrow();
  });
});
