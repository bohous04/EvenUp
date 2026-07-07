/**
 * The five split methods (PRD §4.4). Every method returns a per-member share in
 * integer minor units whose sum equals the transaction total **exactly**, via
 * the largest-remainder allocator. Pure and float-free.
 */

import { allocateByWeights } from '../money/rounding.js';

export interface SplitShare {
  readonly memberId: string;
  readonly computedMinorUnits: number;
}

export interface EqualMember {
  readonly memberId: string;
  /** Default share / weight (FR-2.3). Defaults to 1. */
  readonly weight?: number;
}

export interface ExactMember {
  readonly memberId: string;
  readonly exactMinorUnits: number;
}

export interface ShareMember {
  readonly memberId: string;
  readonly weight: number;
}

export interface PercentageMember {
  readonly memberId: string;
  /** Percentage of the total (e.g. 33.33). Across members must sum to 100. */
  readonly percentage: number;
}

export interface ItemizedItem {
  readonly id?: string;
  readonly totalMinorUnits: number;
  /** Members sharing this item; split evenly among them. */
  readonly memberIds: readonly string[];
}

export type ExtraAllocation =
  | { readonly kind: 'proportional' }
  | { readonly kind: 'evenly'; readonly memberIds: readonly string[] }
  | { readonly kind: 'shares'; readonly members: readonly ShareMember[] };

export interface ExtraCharge {
  readonly label?: string;
  readonly amountMinorUnits: number;
  readonly allocation: ExtraAllocation;
}

export interface ItemizedInput {
  readonly items: readonly ItemizedItem[];
  readonly extraCharges?: readonly ExtraCharge[];
}

function assertSafeIntegerTotal(total: number): void {
  if (!Number.isSafeInteger(total)) {
    throw new TypeError(`total must be a safe integer, received ${total}`);
  }
}

/** Equal split, respecting per-member default shares. (FR-4.1) */
export function splitEqually(total: number, members: readonly EqualMember[]): SplitShare[] {
  assertSafeIntegerTotal(total);
  if (members.length === 0) {
    throw new RangeError('Cannot split equally among zero members');
  }
  const weights = members.map((m) => m.weight ?? 1);
  const amounts = allocateByWeights(total, weights);
  return members.map((m, i) => ({ memberId: m.memberId, computedMinorUnits: amounts[i]! }));
}

/** Exact per-member amounts; must sum to the total. (FR-4.2) */
export function splitByExactAmounts(total: number, members: readonly ExactMember[]): SplitShare[] {
  assertSafeIntegerTotal(total);
  let allocated = 0;
  for (const m of members) {
    if (!Number.isSafeInteger(m.exactMinorUnits)) {
      throw new TypeError(`exact amount must be a safe integer, received ${m.exactMinorUnits}`);
    }
    allocated += m.exactMinorUnits;
  }
  if (allocated !== total) {
    throw new RangeError(`Exact amounts sum to ${allocated} but the total is ${total}`);
  }
  return members.map((m) => ({ memberId: m.memberId, computedMinorUnits: m.exactMinorUnits }));
}

/** Proportional split by integer weights. (FR-4.3) */
export function splitByShares(total: number, members: readonly ShareMember[]): SplitShare[] {
  assertSafeIntegerTotal(total);
  if (members.length === 0) {
    throw new RangeError('Cannot split by shares among zero members');
  }
  const amounts = allocateByWeights(
    total,
    members.map((m) => m.weight),
  );
  return members.map((m, i) => ({ memberId: m.memberId, computedMinorUnits: amounts[i]! }));
}

/** Proportional split by percentages; must sum to exactly 100%. (FR-4.4) */
export function splitByPercentage(
  total: number,
  members: readonly PercentageMember[],
): SplitShare[] {
  assertSafeIntegerTotal(total);
  if (members.length === 0) {
    throw new RangeError('Cannot split by percentage among zero members');
  }
  // Convert to integer basis points (hundredths of a percent) for exact validation.
  const basisPoints = members.map((m) => {
    const bp = Math.round(m.percentage * 100);
    if (!Number.isFinite(bp) || bp < 0) {
      throw new RangeError(`Invalid percentage: ${m.percentage}`);
    }
    return bp;
  });
  const totalBp = basisPoints.reduce((a, b) => a + b, 0);
  if (totalBp !== 10_000) {
    throw new RangeError(
      `Percentages must sum to 100% (got ${totalBp / 100}%); adjust so they total exactly 100.`,
    );
  }
  const amounts = allocateByWeights(total, basisPoints);
  return members.map((m, i) => ({ memberId: m.memberId, computedMinorUnits: amounts[i]! }));
}

/**
 * Itemized split (FR-4.5): each line item is split evenly among its assignees;
 * optional extra charges (tax/tip/service) are allocated proportionally across
 * item subtotals, evenly among chosen members, or by explicit shares.
 */
export function splitItemized(input: ItemizedInput): SplitShare[] {
  const { items, extraCharges = [] } = input;
  if (items.length === 0) {
    throw new RangeError('Itemized split requires at least one item');
  }

  // Accumulate per-member totals, tracking first-appearance order for stability.
  const order: string[] = [];
  const totals = new Map<string, number>();
  const add = (memberId: string, amount: number) => {
    if (!totals.has(memberId)) {
      totals.set(memberId, 0);
      order.push(memberId);
    }
    totals.set(memberId, totals.get(memberId)! + amount);
  };

  // 1. Items, split evenly among assignees.
  const subtotals = new Map<string, number>();
  for (const item of items) {
    if (!Number.isSafeInteger(item.totalMinorUnits)) {
      throw new TypeError(`item total must be a safe integer, received ${item.totalMinorUnits}`);
    }
    if (item.memberIds.length === 0) {
      throw new RangeError('Every item must be assigned to at least one member');
    }
    const parts = allocateByWeights(
      item.totalMinorUnits,
      item.memberIds.map(() => 1),
    );
    item.memberIds.forEach((memberId, i) => {
      add(memberId, parts[i]!);
      subtotals.set(memberId, (subtotals.get(memberId) ?? 0) + parts[i]!);
    });
  }

  // 2. Extra charges.
  for (const charge of extraCharges) {
    if (!Number.isSafeInteger(charge.amountMinorUnits)) {
      throw new TypeError(
        `extra charge must be a safe integer, received ${charge.amountMinorUnits}`,
      );
    }
    const allocation = charge.allocation;
    if (allocation.kind === 'proportional') {
      const members = order.filter((m) => (subtotals.get(m) ?? 0) !== 0);
      const weights = members.map((m) => Math.abs(subtotals.get(m)!));
      if (weights.reduce((a, b) => a + b, 0) === 0) {
        throw new RangeError(
          'Cannot allocate a proportional charge without non-zero item subtotals',
        );
      }
      const parts = allocateByWeights(charge.amountMinorUnits, weights);
      members.forEach((m, i) => add(m, parts[i]!));
    } else if (allocation.kind === 'evenly') {
      if (allocation.memberIds.length === 0) {
        throw new RangeError('Evenly-shared charge needs at least one member');
      }
      const parts = allocateByWeights(
        charge.amountMinorUnits,
        allocation.memberIds.map(() => 1),
      );
      allocation.memberIds.forEach((m, i) => add(m, parts[i]!));
    } else {
      if (allocation.members.length === 0) {
        throw new RangeError('Shares charge needs at least one member');
      }
      const parts = allocateByWeights(
        charge.amountMinorUnits,
        allocation.members.map((m) => m.weight),
      );
      allocation.members.forEach((m, i) => add(m.memberId, parts[i]!));
    }
  }

  return order.map((memberId) => ({ memberId, computedMinorUnits: totals.get(memberId)! }));
}

/** Sum of an itemized input's items and extra charges. */
export function itemizedTotal(input: ItemizedInput): number {
  const itemsTotal = input.items.reduce((a, item) => a + item.totalMinorUnits, 0);
  const extrasTotal = (input.extraCharges ?? []).reduce((a, c) => a + c.amountMinorUnits, 0);
  return itemsTotal + extrasTotal;
}

export type SplitInput =
  | { readonly type: 'equal'; readonly total: number; readonly members: readonly EqualMember[] }
  | { readonly type: 'exact'; readonly total: number; readonly members: readonly ExactMember[] }
  | { readonly type: 'shares'; readonly total: number; readonly members: readonly ShareMember[] }
  | {
      readonly type: 'percentage';
      readonly total: number;
      readonly members: readonly PercentageMember[];
    }
  | ({ readonly type: 'itemized' } & ItemizedInput);

export interface SplitResult {
  readonly total: number;
  readonly shares: SplitShare[];
}

/** Dispatch to the appropriate split method and report the resolved total. */
export function computeSplit(input: SplitInput): SplitResult {
  switch (input.type) {
    case 'equal':
      return { total: input.total, shares: splitEqually(input.total, input.members) };
    case 'exact':
      return { total: input.total, shares: splitByExactAmounts(input.total, input.members) };
    case 'shares':
      return { total: input.total, shares: splitByShares(input.total, input.members) };
    case 'percentage':
      return { total: input.total, shares: splitByPercentage(input.total, input.members) };
    case 'itemized':
      return { total: itemizedTotal(input), shares: splitItemized(input) };
  }
}
