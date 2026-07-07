import { describe, expect, test } from 'vitest';
import * as fc from 'fast-check';
import { allocateByWeights, allocateEvenly } from './rounding.js';

describe('allocateByWeights', () => {
  test('splits an evenly divisible total into equal weighted parts', () => {
    expect(allocateByWeights(900, [1, 1, 1])).toEqual([300, 300, 300]);
  });

  test('distributes residual minor units by largest remainder, stable by index', () => {
    // 100 / 3 = 33.33 -> base 33 each, 1 leftover unit goes to the first bucket
    // (all remainders equal, so lowest index wins the tie).
    expect(allocateByWeights(100, [1, 1, 1])).toEqual([34, 33, 33]);
  });

  test('allocates proportionally to weights', () => {
    // 2:1:1 of 100 -> 50, 25, 25
    expect(allocateByWeights(100, [2, 1, 1])).toEqual([50, 25, 25]);
  });

  test('gives residual to the largest fractional remainder first', () => {
    // 10 across weights 1:1:1 -> 3.33 each; remainders equal -> indices 0,1 get the extra.
    expect(allocateByWeights(10, [1, 1, 1])).toEqual([4, 3, 3]);
  });

  test('ignores zero-weight buckets (they receive nothing)', () => {
    expect(allocateByWeights(100, [1, 0, 1])).toEqual([50, 0, 50]);
  });

  test('handles a negative total (income) keeping the exact sum', () => {
    expect(allocateByWeights(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
  });

  test('returns an empty allocation for an empty weight list and zero total', () => {
    expect(allocateByWeights(0, [])).toEqual([]);
  });

  test('throws when weights sum to zero but total is non-zero', () => {
    expect(() => allocateByWeights(100, [0, 0])).toThrow();
  });

  test('throws on a non-integer total', () => {
    expect(() => allocateByWeights(10.5, [1, 1])).toThrow();
  });

  test('throws on negative or non-integer weights', () => {
    expect(() => allocateByWeights(100, [1, -1])).toThrow();
    expect(() => allocateByWeights(100, [1, 0.5])).toThrow();
  });

  test('property: allocations always sum exactly to the total', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 20 }),
        (total, weights) => {
          fc.pre(weights.reduce((a, b) => a + b, 0) > 0);
          const parts = allocateByWeights(total, weights);
          expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
        },
      ),
    );
  });

  test('property: each part is within one unit of its ideal proportional share', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.array(fc.integer({ min: 1, max: 1000 }), { minLength: 1, maxLength: 20 }),
        (total, weights) => {
          const sumW = weights.reduce((a, b) => a + b, 0);
          const parts = allocateByWeights(total, weights);
          parts.forEach((part, i) => {
            const ideal = (total * weights[i]!) / sumW;
            expect(Math.abs(part - ideal)).toBeLessThan(1);
          });
        },
      ),
    );
  });

  test('property: zero-weight buckets always receive zero', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100_000, max: 100_000 }),
        fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 1, maxLength: 15 }),
        (total, weights) => {
          fc.pre(weights.reduce((a, b) => a + b, 0) > 0);
          const parts = allocateByWeights(total, weights);
          weights.forEach((w, i) => {
            if (w === 0) expect(parts[i]).toBe(0);
          });
        },
      ),
    );
  });
});

describe('allocateEvenly', () => {
  test('is equivalent to equal weights', () => {
    expect(allocateEvenly(100, 3)).toEqual([34, 33, 33]);
  });

  test('returns an empty array for zero participants and zero total', () => {
    expect(allocateEvenly(0, 0)).toEqual([]);
  });

  test('throws when splitting a non-zero total among zero participants', () => {
    expect(() => allocateEvenly(100, 0)).toThrow();
  });
});
