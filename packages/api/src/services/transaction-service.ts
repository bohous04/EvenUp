/**
 * Turn a validated expense input into the per-member shares using @evenup/core,
 * validating that the payers' amounts sum to the transaction total (FR-3.2) and
 * that the split type's own invariants hold. Pure — no database access — so it
 * is exhaustively unit-testable.
 */
import { computeSplit, itemizedTotal, type SplitShare, type SplitInput } from '@evenup/core';
import { TRPCError } from '@trpc/server';
import type { CreateExpenseInput, SplitConfig } from '../schemas.js';

export interface ExpensePlan {
  readonly totalMinorUnits: number;
  readonly splitType: 'EQUAL' | 'EXACT' | 'SHARES' | 'PERCENTAGE' | 'ITEMIZED';
  readonly shares: SplitShare[];
}

function toCoreSplit(total: number, split: SplitConfig): SplitInput {
  switch (split.type) {
    case 'EQUAL':
      return { type: 'equal', total, members: split.members };
    case 'EXACT':
      return { type: 'exact', total, members: split.members };
    case 'SHARES':
      return { type: 'shares', total, members: split.members };
    case 'PERCENTAGE':
      return { type: 'percentage', total, members: split.members };
    case 'ITEMIZED':
      return { type: 'itemized', items: split.items, extraCharges: split.extraCharges };
  }
}

/** Compute the expense plan (total + per-member shares), or throw a tRPC error. */
export function planExpense(input: CreateExpenseInput): ExpensePlan {
  const payersTotal = input.payers.reduce((acc, p) => acc + p.amountMinorUnits, 0);

  // For itemized expenses the total is derived from items + extra charges and
  // the payers must cover exactly that; for the rest the payers define the total.
  const total =
    input.split.type === 'ITEMIZED'
      ? itemizedTotal({ items: input.split.items, extraCharges: input.split.extraCharges })
      : payersTotal;

  if (payersTotal !== total) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Payers paid ${payersTotal} but the expense total is ${total}.`,
    });
  }

  let result;
  try {
    result = computeSplit(toCoreSplit(total, input.split));
  } catch (err) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: err instanceof Error ? err.message : 'Invalid split',
    });
  }

  return { totalMinorUnits: result.total, splitType: input.split.type, shares: result.shares };
}
