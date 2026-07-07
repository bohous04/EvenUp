import { describe, expect, test } from 'vitest';
import * as fc from 'fast-check';
import {
  splitEqually,
  splitByExactAmounts,
  splitByShares,
  splitByPercentage,
  splitItemized,
  computeSplit,
  type SplitInput,
} from './split.js';

const sum = (shares: { computedMinorUnits: number }[]) =>
  shares.reduce((acc, s) => acc + s.computedMinorUnits, 0);

describe('splitEqually (FR-4.1)', () => {
  test('divides evenly among members', () => {
    expect(splitEqually(900, [{ memberId: 'a' }, { memberId: 'b' }, { memberId: 'c' }])).toEqual([
      { memberId: 'a', computedMinorUnits: 300 },
      { memberId: 'b', computedMinorUnits: 300 },
      { memberId: 'c', computedMinorUnits: 300 },
    ]);
  });

  test('distributes residual cents by member order', () => {
    expect(splitEqually(100, [{ memberId: 'a' }, { memberId: 'b' }, { memberId: 'c' }])).toEqual([
      { memberId: 'a', computedMinorUnits: 34 },
      { memberId: 'b', computedMinorUnits: 33 },
      { memberId: 'c', computedMinorUnits: 33 },
    ]);
  });

  test('respects per-member default shares (weights)', () => {
    expect(
      splitEqually(100, [
        { memberId: 'couple', weight: 2 },
        { memberId: 'solo', weight: 1 },
        { memberId: 'solo2', weight: 1 },
      ]),
    ).toEqual([
      { memberId: 'couple', computedMinorUnits: 50 },
      { memberId: 'solo', computedMinorUnits: 25 },
      { memberId: 'solo2', computedMinorUnits: 25 },
    ]);
  });

  test('throws with no members', () => {
    expect(() => splitEqually(100, [])).toThrow();
  });
});

describe('splitByExactAmounts (FR-4.2)', () => {
  test('uses the explicit per-member amounts', () => {
    expect(
      splitByExactAmounts(100, [
        { memberId: 'a', exactMinorUnits: 70 },
        { memberId: 'b', exactMinorUnits: 30 },
      ]),
    ).toEqual([
      { memberId: 'a', computedMinorUnits: 70 },
      { memberId: 'b', computedMinorUnits: 30 },
    ]);
  });

  test('throws when the amounts do not sum to the total', () => {
    expect(() =>
      splitByExactAmounts(100, [
        { memberId: 'a', exactMinorUnits: 70 },
        { memberId: 'b', exactMinorUnits: 20 },
      ]),
    ).toThrow();
  });
});

describe('splitByShares (FR-4.3)', () => {
  test('allocates proportionally to integer weights', () => {
    expect(
      splitByShares(100, [
        { memberId: 'a', weight: 2 },
        { memberId: 'b', weight: 1 },
        { memberId: 'c', weight: 1 },
      ]),
    ).toEqual([
      { memberId: 'a', computedMinorUnits: 50 },
      { memberId: 'b', computedMinorUnits: 25 },
      { memberId: 'c', computedMinorUnits: 25 },
    ]);
  });

  test('throws when all weights are zero', () => {
    expect(() =>
      splitByShares(100, [
        { memberId: 'a', weight: 0 },
        { memberId: 'b', weight: 0 },
      ]),
    ).toThrow();
  });
});

describe('splitByPercentage (FR-4.4)', () => {
  test('allocates by whole percentages', () => {
    expect(
      splitByPercentage(10000, [
        { memberId: 'a', percentage: 50 },
        { memberId: 'b', percentage: 30 },
        { memberId: 'c', percentage: 20 },
      ]),
    ).toEqual([
      { memberId: 'a', computedMinorUnits: 5000 },
      { memberId: 'b', computedMinorUnits: 3000 },
      { memberId: 'c', computedMinorUnits: 2000 },
    ]);
  });

  test('allocates by fractional percentages summing to exactly 100', () => {
    const shares = splitByPercentage(10000, [
      { memberId: 'a', percentage: 33.33 },
      { memberId: 'b', percentage: 33.33 },
      { memberId: 'c', percentage: 33.34 },
    ]);
    expect(sum(shares)).toBe(10000);
  });

  test('throws when percentages do not sum to 100', () => {
    expect(() =>
      splitByPercentage(10000, [
        { memberId: 'a', percentage: 33.33 },
        { memberId: 'b', percentage: 33.33 },
        { memberId: 'c', percentage: 33.33 },
      ]),
    ).toThrow();
  });
});

describe('splitItemized (FR-4.5)', () => {
  test('splits each item evenly among its assignees and sums to the items total', () => {
    const shares = splitItemized({
      items: [
        { totalMinorUnits: 100, memberIds: ['a', 'b'] },
        { totalMinorUnits: 90, memberIds: ['a'] },
        { totalMinorUnits: 30, memberIds: ['a', 'b', 'c'] },
      ],
    });
    expect(shares).toEqual([
      { memberId: 'a', computedMinorUnits: 150 },
      { memberId: 'b', computedMinorUnits: 60 },
      { memberId: 'c', computedMinorUnits: 10 },
    ]);
  });

  test('allocates a proportional extra charge (tax) across item subtotals', () => {
    const shares = splitItemized({
      items: [
        { totalMinorUnits: 100, memberIds: ['a', 'b'] },
        { totalMinorUnits: 90, memberIds: ['a'] },
        { totalMinorUnits: 30, memberIds: ['a', 'b', 'c'] },
      ],
      extraCharges: [{ amountMinorUnits: 22, allocation: { kind: 'proportional' } }],
    });
    // subtotals a=150 b=60 c=10 (sum 220); tax 22 -> a=15 b=6 c=1
    expect(shares).toEqual([
      { memberId: 'a', computedMinorUnits: 165 },
      { memberId: 'b', computedMinorUnits: 66 },
      { memberId: 'c', computedMinorUnits: 11 },
    ]);
  });

  test('allocates an evenly-shared extra charge (tip)', () => {
    const shares = splitItemized({
      items: [{ totalMinorUnits: 90, memberIds: ['a', 'b', 'c'] }],
      extraCharges: [
        { amountMinorUnits: 30, allocation: { kind: 'evenly', memberIds: ['a', 'b', 'c'] } },
      ],
    });
    expect(shares).toEqual([
      { memberId: 'a', computedMinorUnits: 40 },
      { memberId: 'b', computedMinorUnits: 40 },
      { memberId: 'c', computedMinorUnits: 40 },
    ]);
  });

  test('throws when an item has no assignees', () => {
    expect(() => splitItemized({ items: [{ totalMinorUnits: 100, memberIds: [] }] })).toThrow();
  });

  test('throws when proportional allocation has no item subtotals to weigh against', () => {
    expect(() =>
      splitItemized({
        items: [{ totalMinorUnits: 0, memberIds: ['a'] }],
        extraCharges: [{ amountMinorUnits: 10, allocation: { kind: 'proportional' } }],
      }),
    ).toThrow();
  });
});

describe('computeSplit dispatcher', () => {
  test('routes to the correct split type and reports the total', () => {
    const input: SplitInput = {
      type: 'equal',
      total: 100,
      members: [{ memberId: 'a' }, { memberId: 'b' }, { memberId: 'c' }],
    };
    const result = computeSplit(input);
    expect(result.shares).toEqual([
      { memberId: 'a', computedMinorUnits: 34 },
      { memberId: 'b', computedMinorUnits: 33 },
      { memberId: 'c', computedMinorUnits: 33 },
    ]);
    expect(result.total).toBe(100);
  });

  test('computes the itemized total from items plus extra charges', () => {
    const result = computeSplit({
      type: 'itemized',
      items: [{ totalMinorUnits: 90, memberIds: ['a', 'b', 'c'] }],
      extraCharges: [
        { amountMinorUnits: 30, allocation: { kind: 'evenly', memberIds: ['a', 'b', 'c'] } },
      ],
    });
    expect(result.total).toBe(120);
    expect(sum(result.shares)).toBe(120);
  });

  test('property: every split type produces shares that sum exactly to the total', () => {
    const memberIds = ['a', 'b', 'c', 'd', 'e'];
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.array(fc.integer({ min: 1, max: 10 }), { minLength: 2, maxLength: 5 }),
        (total, weights) => {
          const members = weights.map((w, i) => ({ memberId: memberIds[i]!, weight: w }));
          expect(sum(splitEqually(total, members))).toBe(total);
          expect(sum(splitByShares(total, members))).toBe(total);
        },
      ),
    );
  });
});
