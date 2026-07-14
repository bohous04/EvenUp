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
  rankNextRound,
  visibleAvatar,
  type Balance,
  type BalanceTransaction,
  type Payment,
  type NextPayerCandidate,
} from '@evenup/core';
import { toMinor, type Prisma, type PrismaClient } from '@evenup/db';
import { TRPCError } from '@trpc/server';

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
  /** The member's user profile picture (data/URL), or null → show the monogram. */
  readonly image: string | null;
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
  // Caller-supplied `group` must satisfy `group.id === groupId`; a mismatched pair
  // would silently compute balances against the wrong group's members.
  group?: Prisma.GroupGetPayload<{ include: { members: true } }>,
): Promise<GroupBalanceResult> {
  const loadedGroup =
    group ??
    (await prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      include: { members: true },
    }));
  const balanceTxns = await loadBalanceTransactions(prisma, groupId);
  const rawBalances = computeNetBalances(balanceTxns);
  const byId = new Map(rawBalances.map((b) => [b.memberId, b.balanceMinorUnits]));

  // Profile pictures live on the linked User (a member may be a userless ghost),
  // fetched separately so the optional `group` param's type stays as-is.
  const imageByMember = new Map(
    (
      await prisma.member.findMany({
        where: { groupId },
        select: { id: true, user: { select: { image: true, hideProfilePhoto: true } } },
      })
    ).map((m) => [m.id, visibleAvatar(m.user)]),
  );

  const balances: MemberBalance[] = loadedGroup.members.map((m) => ({
    memberId: m.id,
    balanceMinorUnits: byId.get(m.id) ?? 0,
    displayName: m.displayName,
    initials: m.initials,
    color: m.color,
    image: imageByMember.get(m.id) ?? null,
  }));

  const payments = loadedGroup.simplifyDebts
    ? minimizeDebts(rawBalances)
    : computeDirectDebts(balanceTxns);

  return { balances, payments, simplified: loadedGroup.simplifyDebts };
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
      readonly clearsGate: boolean;
      readonly payers: MemberBalance[];
      readonly runnerUp: MemberBalance[];
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

  const { balances } = await getGroupBalances(prisma, groupId, group);
  const byId = new Map(balances.map((b) => [b.memberId, b]));

  const candidates: NextPayerCandidate[] = activeMembers.map((m) => ({
    memberId: m.id,
    balanceMinorUnits: byId.get(m.id)?.balanceMinorUnits ?? 0,
    shareWeight: m.defaultShare,
    lastPaidAt: lastPaidAt.get(m.id) ?? null,
  }));

  const ranking = rankNextRound(candidates, typicalExpenseMinorUnits);
  // An empty ranking now means exactly one thing: nobody owes anything.
  if (!ranking) return { state: 'square' };

  // Safe: every ranked memberId comes from `candidates`, built from `activeMembers`,
  // and `byId` is built from `balances`, which covers every member of the group.
  const toBalances = (cs: readonly NextPayerCandidate[]) => cs.map((c) => byId.get(c.memberId)!);

  return {
    state: 'suggested',
    typicalExpenseMinorUnits,
    clearsGate: ranking.clearsGate,
    payers: toBalances(ranking.payers),
    runnerUp: toBalances(ranking.runnerUp),
  };
}

export interface BreakdownItem {
  name: string;
  quantity: number;
  portionMinorUnits: number;
}
export interface BreakdownEntry {
  txId: string;
  title: string;
  date: Date;
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  kind: 'paid' | 'share';
  amountMinorUnits: number;
  transferLabel: string | null;
  currency: string | null;
  items: BreakdownItem[] | null;
  remainderMinorUnits: number | null;
}
export interface MemberBreakdown {
  memberId: string;
  displayName: string;
  balanceMinorUnits: number;
  spentMinorUnits: number;
  paidMinorUnits: number;
  entries: BreakdownEntry[];
}

/** Per-member ledger explaining one member's balance (paid vs share, with
 *  itemized receipt drill-in). Reuses the same base re-allocation as
 *  getGroupBalances, so `entries` sum to `balanceMinorUnits`. */
export async function getMemberBreakdown(
  prisma: PrismaClient,
  groupId: string,
  memberId: string,
): Promise<MemberBreakdown> {
  const member = await prisma.member.findFirst({
    where: { id: memberId, groupId },
    select: { id: true, displayName: true },
  });
  if (!member) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found in this group' });
  }

  const nameById = new Map(
    (await prisma.member.findMany({ where: { groupId }, select: { id: true, displayName: true } })).map(
      (m) => [m.id, m.displayName],
    ),
  );

  const txns = await prisma.transaction.findMany({
    where: { groupId },
    include: { payers: true, splits: true, receiptItems: { include: { assignments: true } } },
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
  });

  const entries: BreakdownEntry[] = [];
  let balance = 0;
  let spent = 0;
  let paid = 0;

  for (const t of txns) {
    const base = toMinor(t.baseMinorUnits);
    const basePayers = safeAllocate(
      base,
      t.payers.map((p) => toMinor(p.amountMinorUnits)),
    );
    const baseSplits = safeAllocate(
      base,
      t.splits.map((s) => toMinor(s.computedMinorUnits)),
    );
    const transferLabel =
      t.type === 'TRANSFER' && t.fromMemberId && t.toMemberId
        ? `${nameById.get(t.fromMemberId) ?? '?'} → ${nameById.get(t.toMemberId) ?? '?'}`
        : null;

    t.payers.forEach((p, i) => {
      if (p.memberId !== memberId) return;
      const amount = basePayers[i]!;
      balance += amount;
      if (t.type === 'EXPENSE') paid += amount;
      entries.push({
        txId: t.id,
        title: t.title,
        date: t.date,
        type: t.type,
        kind: 'paid',
        amountMinorUnits: amount,
        transferLabel,
        currency: null,
        items: null,
        remainderMinorUnits: null,
      });
    });

    t.splits.forEach((s, i) => {
      if (s.memberId !== memberId) return;
      const shareBase = baseSplits[i]!;
      balance -= shareBase;
      if (t.type === 'EXPENSE') spent += shareBase;

      let items: BreakdownItem[] | null = null;
      let remainderMinorUnits: number | null = null;
      let currency: string | null = null;
      if (t.splitType === 'ITEMIZED' && t.receiptItems.length > 0) {
        const mine = t.receiptItems.filter((ri) => ri.assignments.some((a) => a.memberId === memberId));
        if (mine.length > 0) {
          currency = t.currency;
          items = mine.map((ri) => ({
            name: ri.name,
            quantity: Number(ri.quantity),
            portionMinorUnits: Math.round(toMinor(ri.totalMinorUnits) / ri.assignments.length),
          }));
          const shareTx = toMinor(s.computedMinorUnits);
          remainderMinorUnits = shareTx - items.reduce((a, it) => a + it.portionMinorUnits, 0);
        }
      }

      entries.push({
        txId: t.id,
        title: t.title,
        date: t.date,
        type: t.type,
        kind: 'share',
        amountMinorUnits: -shareBase,
        transferLabel,
        currency,
        items,
        remainderMinorUnits,
      });
    });
  }

  return {
    memberId: member.id,
    displayName: member.displayName,
    balanceMinorUnits: balance,
    spentMinorUnits: spent,
    paidMinorUnits: paid,
    entries,
  };
}
