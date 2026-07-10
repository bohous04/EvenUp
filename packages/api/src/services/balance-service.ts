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
  suggestNextPayer,
  type Balance,
  type BalanceTransaction,
  type Payment,
  type NextPayerCandidate,
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

/** Expenses inspected when estimating the group's typical round. */
const MEDIAN_WINDOW = 10;
/** Below this, a group has no "typical" expense and the card stays hidden. */
const MIN_EXPENSES_FOR_SUGGESTION = 3;

export type NextRoundResult =
  | { readonly state: 'hidden' }
  | { readonly state: 'square' }
  | {
      readonly state: 'suggested';
      readonly typicalExpenseMinorUnits: number;
      readonly ranked: MemberBalance[];
    };

/** Lower median: integer, deterministic, no averaging of two middles. */
function lowerMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[(sorted.length - 1) >> 1]!;
}

/** Who should pay the group's next shared expense (PRD §1.2). */
export async function getNextRound(
  prisma: PrismaClient,
  groupId: string,
): Promise<NextRoundResult> {
  const group = await prisma.group.findUniqueOrThrow({
    where: { id: groupId },
    include: { members: true },
  });
  if (group.archivedAt) return { state: 'hidden' };

  const activeMembers = group.members.filter((m) => m.isActive);
  if (activeMembers.length < 2) return { state: 'hidden' };

  // One ordered pass yields both the median and lastPaidAt. `groupBy` cannot
  // aggregate Transaction.date from TransactionPayer — the date is on the parent.
  // `id` is the tiebreak: two expenses on the same date would otherwise leave the
  // row order — and therefore lastPaidAt — up to Postgres.
  const expenses = await prisma.transaction.findMany({
    where: { groupId, type: 'EXPENSE' },
    select: { date: true, baseMinorUnits: true, payers: { select: { memberId: true } } },
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
  });
  if (expenses.length < MIN_EXPENSES_FOR_SUGGESTION) return { state: 'hidden' };

  const typicalExpenseMinorUnits = lowerMedian(
    expenses.slice(0, MEDIAN_WINDOW).map((e) => toMinor(e.baseMinorUnits)),
  );

  const lastPaidAt = new Map<string, number>();
  for (const e of expenses) {
    for (const p of e.payers) {
      if (!lastPaidAt.has(p.memberId)) lastPaidAt.set(p.memberId, e.date.getTime());
    }
  }

  const { balances } = await getGroupBalances(prisma, groupId);
  const byId = new Map(balances.map((b) => [b.memberId, b]));

  const candidates: NextPayerCandidate[] = activeMembers.map((m) => ({
    memberId: m.id,
    balanceMinorUnits: byId.get(m.id)?.balanceMinorUnits ?? 0,
    shareWeight: m.defaultShare,
    lastPaidAt: lastPaidAt.get(m.id) ?? null,
  }));

  const ranked = suggestNextPayer(candidates, typicalExpenseMinorUnits).map((c) => byId.get(c.memberId)!);
  if (ranked.length === 0) return { state: 'square' };

  return { state: 'suggested', typicalExpenseMinorUnits, ranked };
}
