/**
 * Net balances and debt minimization (PRD §4.6, §5).
 *
 * Everything operates on integer minor units in the group's base currency and
 * is pure and deterministic. A transaction is modelled uniformly by its
 * **payers** (who put money in) and **splits** (who consumed it). A settlement
 * transfer "X pays Y" is just a transaction with payer X and beneficiary Y, so
 * settlements flow through the same balance math.
 *
 * Invariant: for a well-formed transaction `sum(payers) === sum(splits)`, which
 * makes the global net balance sum to exactly zero with no rounding drift.
 */

import { allocateByWeights } from '../money/rounding.js';

export interface PayerEntry {
  readonly memberId: string;
  readonly amountMinorUnits: number;
}

export interface SplitEntry {
  readonly memberId: string;
  readonly computedMinorUnits: number;
}

export interface BalanceTransaction {
  readonly payers: readonly PayerEntry[];
  readonly splits: readonly SplitEntry[];
}

export interface Balance {
  readonly memberId: string;
  /** Net position: positive = creditor (is owed), negative = debtor (owes). */
  readonly balanceMinorUnits: number;
}

export interface Payment {
  readonly fromMemberId: string;
  readonly toMemberId: string;
  readonly amountMinorUnits: number;
}

/** Net balance per member = total paid − total owed. (FR-6.1) */
export function computeNetBalances(transactions: readonly BalanceTransaction[]): Balance[] {
  const order: string[] = [];
  const net = new Map<string, number>();
  const bump = (memberId: string, delta: number) => {
    if (!net.has(memberId)) {
      net.set(memberId, 0);
      order.push(memberId);
    }
    net.set(memberId, net.get(memberId)! + delta);
  };

  for (const txn of transactions) {
    for (const p of txn.payers) bump(p.memberId, p.amountMinorUnits);
    for (const s of txn.splits) bump(s.memberId, -s.computedMinorUnits);
  }

  return order.map((memberId) => ({ memberId, balanceMinorUnits: net.get(memberId)! }));
}

function byAmountDescThenId(
  a: { id: string; amt: number },
  b: { id: string; amt: number },
): number {
  if (b.amt !== a.amt) return b.amt - a.amt;
  return a.id < b.id ? -1 : 1; // member ids are unique, so equality never occurs
}

/**
 * Greedy min-cash-flow debt minimization (§5.2). Repeatedly settles the largest
 * debtor against the largest creditor. Produces at most `n − 1` payments for `n`
 * non-zero members and settles every balance to zero. Deterministic: ties are
 * broken by member id.
 */
export function minimizeDebts(balances: readonly Balance[]): Payment[] {
  const debtors = balances
    .filter((b) => b.balanceMinorUnits < 0)
    .map((b) => ({ id: b.memberId, amt: -b.balanceMinorUnits }))
    .sort(byAmountDescThenId);
  const creditors = balances
    .filter((b) => b.balanceMinorUnits > 0)
    .map((b) => ({ id: b.memberId, amt: b.balanceMinorUnits }))
    .sort(byAmountDescThenId);

  const payments: Payment[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i]!;
    const c = creditors[j]!;
    const pay = Math.min(d.amt, c.amt);
    if (pay > 0) {
      payments.push({ fromMemberId: d.id, toMemberId: c.id, amountMinorUnits: pay });
    }
    d.amt -= pay;
    c.amt -= pay;
    if (d.amt === 0) i++;
    if (c.amt === 0) j++;
  }
  return payments;
}

/**
 * Direct (un-simplified) debts: who owes whom from each expense, netted only
 * pairwise between the same two people. Each beneficiary's share is attributed
 * to the payers in proportion to how much each paid. (FR-6.3)
 */
export function computeDirectDebts(transactions: readonly BalanceTransaction[]): Payment[] {
  const gross = new Map<string, Map<string, number>>();
  const addGross = (from: string, to: string, amount: number) => {
    if (from === to || amount === 0) return;
    let row = gross.get(from);
    if (!row) {
      row = new Map<string, number>();
      gross.set(from, row);
    }
    row.set(to, (row.get(to) ?? 0) + amount);
  };

  for (const txn of transactions) {
    const paidTotal = txn.payers.reduce((a, p) => a + p.amountMinorUnits, 0);
    if (paidTotal === 0) continue;
    const payerWeights = txn.payers.map((p) => p.amountMinorUnits);
    for (const split of txn.splits) {
      const parts = allocateByWeights(split.computedMinorUnits, payerWeights);
      txn.payers.forEach((payer, k) => addGross(split.memberId, payer.memberId, parts[k]!));
    }
  }

  // Net each unordered pair and emit a single directed payment.
  const members = new Set<string>();
  for (const [from, row] of gross) {
    members.add(from);
    for (const to of row.keys()) members.add(to);
  }
  const sorted = [...members].sort();
  const payments: Payment[] = [];
  for (let a = 0; a < sorted.length; a++) {
    for (let b = a + 1; b < sorted.length; b++) {
      const x = sorted[a]!;
      const y = sorted[b]!;
      const xy = gross.get(x)?.get(y) ?? 0;
      const yx = gross.get(y)?.get(x) ?? 0;
      const diff = xy - yx;
      if (diff > 0) payments.push({ fromMemberId: x, toMemberId: y, amountMinorUnits: diff });
      else if (diff < 0) payments.push({ fromMemberId: y, toMemberId: x, amountMinorUnits: -diff });
    }
  }
  return payments;
}

export interface SettleOptions {
  /** Whether to simplify debts (FR-2.8 / FR-6.2). Default true. */
  readonly simplify?: boolean;
}

/** Suggested settlements for a set of transactions, honoring the simplify toggle. */
export function settle(
  transactions: readonly BalanceTransaction[],
  options: SettleOptions = {},
): Payment[] {
  const simplify = options.simplify ?? true;
  return simplify
    ? minimizeDebts(computeNetBalances(transactions))
    : computeDirectDebts(transactions);
}
