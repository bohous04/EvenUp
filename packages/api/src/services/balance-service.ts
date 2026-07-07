/**
 * Derive group balances and suggested settlements (PRD §4.6, §5).
 *
 * Splits are stored in the transaction's own currency; to keep balances in the
 * group's base currency exact and zero-sum, each transaction's base total is
 * re-allocated across its payers and beneficiaries in proportion to their
 * transaction-currency amounts. For same-currency transactions this is the
 * identity, so nothing changes.
 */
import {
  allocateByWeights,
  computeNetBalances,
  minimizeDebts,
  computeDirectDebts,
  type Balance,
  type BalanceTransaction,
  type Payment,
} from '@evenup/core';
import { toMinor, type PrismaClient } from '@evenup/db';

function safeAllocate(base: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) {
    // Degenerate (e.g. all-zero amounts): fall back to an even split.
    return allocateByWeights(
      base,
      weights.map(() => 1),
    );
  }
  return allocateByWeights(base, weights);
}

export interface MemberBalance extends Balance {
  readonly displayName: string;
  readonly initials: string;
  readonly color: string;
}

export interface GroupBalanceResult {
  readonly balances: MemberBalance[];
  readonly payments: Payment[];
  readonly simplified: boolean;
}

async function loadBalanceTransactions(
  prisma: PrismaClient,
  groupId: string,
): Promise<BalanceTransaction[]> {
  const txns = await prisma.transaction.findMany({
    where: { groupId },
    include: { payers: true, splits: true },
  });

  return txns.map((t) => {
    const base = toMinor(t.baseMinorUnits);
    const payerWeights = t.payers.map((p) => toMinor(p.amountMinorUnits));
    const splitWeights = t.splits.map((s) => toMinor(s.computedMinorUnits));
    const basePayers = safeAllocate(base, payerWeights);
    const baseSplits = safeAllocate(base, splitWeights);
    return {
      payers: t.payers.map((p, i) => ({ memberId: p.memberId, amountMinorUnits: basePayers[i]! })),
      splits: t.splits.map((s, i) => ({
        memberId: s.memberId,
        computedMinorUnits: baseSplits[i]!,
      })),
    };
  });
}

/** Compute member balances and suggested settlements for a group. */
export async function getGroupBalances(
  prisma: PrismaClient,
  groupId: string,
): Promise<GroupBalanceResult> {
  const group = await prisma.group.findUniqueOrThrow({
    where: { id: groupId },
    include: { members: true },
  });
  const balanceTxns = await loadBalanceTransactions(prisma, groupId);
  const rawBalances = computeNetBalances(balanceTxns);
  const byId = new Map(rawBalances.map((b) => [b.memberId, b.balanceMinorUnits]));

  const balances: MemberBalance[] = group.members.map((m) => ({
    memberId: m.id,
    balanceMinorUnits: byId.get(m.id) ?? 0,
    displayName: m.displayName,
    initials: m.initials,
    color: m.color,
  }));

  const payments = group.simplifyDebts
    ? minimizeDebts(rawBalances)
    : computeDirectDebts(balanceTxns);

  return { balances, payments, simplified: group.simplifyDebts };
}
