/**
 * Bridge between Prisma `BigInt` money columns and the JS safe integers that
 * `@evenup/core` operates on. All conversions guard the safe-integer range so a
 * value that would silently lose precision throws instead.
 */

/** Convert a Prisma BigInt minor-unit value to a JS safe integer. */
export function toMinor(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError(`Money value ${value} exceeds the JS safe integer range`);
  }
  return Number(value);
}

/** Convert a JS safe integer minor-unit value to a Prisma BigInt. */
export function fromMinor(value: number): bigint {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`Money value ${value} must be a safe integer`);
  }
  return BigInt(value);
}
