/**
 * Cent-accurate allocation of integer minor units.
 *
 * Implements the **largest-remainder method** (a.k.a. Hamilton's method): the
 * total is divided in proportion to integer weights, and the leftover minor
 * units are handed out one at a time to the buckets with the largest fractional
 * remainder. The result is deterministic and always sums **exactly** to the
 * input total — there is never any rounding drift. (PRD FR-4.6, §5.3)
 *
 * All math is integer-only; there is no floating-point arithmetic in the
 * allocation path.
 */

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${label} must be an integer, received ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} exceeds the safe integer range: ${value}`);
  }
}

/**
 * Allocate `total` (signed integer minor units) across buckets in proportion to
 * the given non-negative integer `weights`.
 *
 * Guarantees:
 * - `result.length === weights.length`
 * - `sum(result) === total` exactly
 * - buckets with weight 0 always receive 0
 * - deterministic: residual units go to the largest remainders, ties broken by
 *   lowest index (stable member ordering)
 */
export function allocateByWeights(total: number, weights: readonly number[]): number[] {
  assertSafeInteger(total, 'total');

  const n = weights.length;
  if (n === 0) {
    if (total !== 0) {
      throw new RangeError('Cannot allocate a non-zero total across zero buckets');
    }
    return [];
  }

  for (const w of weights) {
    if (!Number.isInteger(w) || w < 0) {
      throw new TypeError(`weights must be non-negative integers, received ${w}`);
    }
  }

  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW === 0) {
    if (total !== 0) {
      throw new RangeError('weights must sum to a positive value to allocate a non-zero total');
    }
    return new Array<number>(n).fill(0);
  }

  // Base (truncated-toward-zero) allocation, plus the remainder numerator used
  // to rank who receives the leftover units. Remainders share the sign of the
  // total, so we compare by magnitude.
  const base = new Array<number>(n);
  const remainder = new Array<number>(n);
  let allocated = 0;
  for (let i = 0; i < n; i++) {
    const product = total * weights[i]!;
    const quotient = Math.trunc(product / sumW);
    base[i] = quotient === 0 ? 0 : quotient; // normalize -0 -> +0
    remainder[i] = product - quotient * sumW;
    allocated += quotient;
  }

  let leftover = total - allocated; // |leftover| < n, sign matches total
  if (leftover !== 0) {
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => {
      const diff = Math.abs(remainder[b]!) - Math.abs(remainder[a]!);
      return diff !== 0 ? diff : a - b;
    });
    const step = leftover > 0 ? 1 : -1;
    let idx = 0;
    while (leftover !== 0) {
      const bucket = order[idx % n]!;
      base[bucket]! += step;
      leftover -= step;
      idx++;
    }
  }

  return base;
}

/**
 * Split `total` evenly across `count` participants (equal weights). Convenience
 * wrapper over {@link allocateByWeights}.
 */
export function allocateEvenly(total: number, count: number): number[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new TypeError(`count must be a non-negative integer, received ${count}`);
  }
  return allocateByWeights(total, new Array<number>(count).fill(1));
}
