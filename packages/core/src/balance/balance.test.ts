import { describe, expect, test } from 'vitest';
import * as fc from 'fast-check';
import {
  computeNetBalances,
  minimizeDebts,
  computeDirectDebts,
  settle,
  type Balance,
  type BalanceTransaction,
  type Payment,
} from './balance.js';

const applyPayments = (balances: Balance[], payments: Payment[]): Map<string, number> => {
  const net = new Map(balances.map((b) => [b.memberId, b.balanceMinorUnits]));
  for (const p of payments) {
    net.set(p.fromMemberId, (net.get(p.fromMemberId) ?? 0) + p.amountMinorUnits);
    net.set(p.toMemberId, (net.get(p.toMemberId) ?? 0) - p.amountMinorUnits);
  }
  return net;
};

describe('computeNetBalances (FR-6.1)', () => {
  test('computes paid minus owed across one expense', () => {
    const txns: BalanceTransaction[] = [
      {
        payers: [{ memberId: 'a', amountMinorUnits: 300 }],
        splits: [
          { memberId: 'a', computedMinorUnits: 100 },
          { memberId: 'b', computedMinorUnits: 100 },
          { memberId: 'c', computedMinorUnits: 100 },
        ],
      },
    ];
    expect(computeNetBalances(txns)).toEqual([
      { memberId: 'a', balanceMinorUnits: 200 },
      { memberId: 'b', balanceMinorUnits: -100 },
      { memberId: 'c', balanceMinorUnits: -100 },
    ]);
  });

  test('a settlement transfer reduces the debtor and creditor balances', () => {
    const txns: BalanceTransaction[] = [
      {
        payers: [{ memberId: 'a', amountMinorUnits: 300 }],
        splits: [
          { memberId: 'a', computedMinorUnits: 100 },
          { memberId: 'b', computedMinorUnits: 100 },
          { memberId: 'c', computedMinorUnits: 100 },
        ],
      },
      // transfer: b pays a 100 -> payer b, beneficiary a
      {
        payers: [{ memberId: 'b', amountMinorUnits: 100 }],
        splits: [{ memberId: 'a', computedMinorUnits: 100 }],
      },
    ];
    expect(computeNetBalances(txns)).toEqual([
      { memberId: 'a', balanceMinorUnits: 100 },
      { memberId: 'b', balanceMinorUnits: 0 },
      { memberId: 'c', balanceMinorUnits: -100 },
    ]);
  });

  test('balances always sum to zero', () => {
    const txns: BalanceTransaction[] = [
      {
        payers: [
          { memberId: 'a', amountMinorUnits: 50 },
          { memberId: 'b', amountMinorUnits: 50 },
        ],
        splits: [
          { memberId: 'a', computedMinorUnits: 34 },
          { memberId: 'b', computedMinorUnits: 33 },
          { memberId: 'c', computedMinorUnits: 33 },
        ],
      },
    ];
    const total = computeNetBalances(txns).reduce((a, b) => a + b.balanceMinorUnits, 0);
    expect(total).toBe(0);
  });
});

describe('minimizeDebts (greedy min-cash-flow, §5)', () => {
  test('the worked example: Jayne -100, Zoe 0, Kaylee +100 -> Jayne pays Kaylee 100 (§5.4)', () => {
    const payments = minimizeDebts([
      { memberId: 'jayne', balanceMinorUnits: -100 },
      { memberId: 'zoe', balanceMinorUnits: 0 },
      { memberId: 'kaylee', balanceMinorUnits: 100 },
    ]);
    expect(payments).toEqual([
      { fromMemberId: 'jayne', toMemberId: 'kaylee', amountMinorUnits: 100 },
    ]);
  });

  test('collapses an A->B->C chain into A->C', () => {
    // A owes B 100, B owes C 100  =>  net A -100, B 0, C +100  =>  A pays C 100
    const payments = minimizeDebts([
      { memberId: 'A', balanceMinorUnits: -100 },
      { memberId: 'B', balanceMinorUnits: 0 },
      { memberId: 'C', balanceMinorUnits: 100 },
    ]);
    expect(payments).toEqual([{ fromMemberId: 'A', toMemberId: 'C', amountMinorUnits: 100 }]);
  });

  test('emits no payments when everyone is settled', () => {
    expect(
      minimizeDebts([
        { memberId: 'a', balanceMinorUnits: 0 },
        { memberId: 'b', balanceMinorUnits: 0 },
      ]),
    ).toEqual([]);
  });

  test('splits one debtor across multiple creditors', () => {
    const payments = minimizeDebts([
      { memberId: 'd', balanceMinorUnits: -100 },
      { memberId: 'c1', balanceMinorUnits: 60 },
      { memberId: 'c2', balanceMinorUnits: 40 },
    ]);
    expect(payments).toEqual([
      { fromMemberId: 'd', toMemberId: 'c1', amountMinorUnits: 60 },
      { fromMemberId: 'd', toMemberId: 'c2', amountMinorUnits: 40 },
    ]);
  });

  test('is deterministic for ties (stable by memberId)', () => {
    const balances: Balance[] = [
      { memberId: 'b', balanceMinorUnits: -50 },
      { memberId: 'a', balanceMinorUnits: -50 },
      { memberId: 'd', balanceMinorUnits: 50 },
      { memberId: 'c', balanceMinorUnits: 50 },
    ];
    const once = minimizeDebts(balances);
    const twice = minimizeDebts([...balances].reverse());
    expect(once).toEqual(twice);
  });

  test('property: settles every balance to zero and emits at most n-1 payments', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -100_000, max: 100_000 }), { minLength: 1, maxLength: 30 }),
        (raw) => {
          // Force the set to sum to zero by absorbing the remainder into the last member.
          const balances: Balance[] = raw.map((v, i) => ({
            memberId: `m${i}`,
            balanceMinorUnits: v,
          }));
          const drift = balances.reduce((a, b) => a + b.balanceMinorUnits, 0);
          balances[balances.length - 1] = {
            memberId: `m${balances.length - 1}`,
            balanceMinorUnits: balances[balances.length - 1]!.balanceMinorUnits - drift,
          };

          const payments = minimizeDebts(balances);
          const nonZero = balances.filter((b) => b.balanceMinorUnits !== 0).length;

          // settles everyone to zero
          const settled = applyPayments(balances, payments);
          for (const v of settled.values()) expect(v).toBe(0);

          // at most n-1 payments
          expect(payments.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1));

          // never emits a non-positive payment
          for (const p of payments) expect(p.amountMinorUnits).toBeGreaterThan(0);
        },
      ),
    );
  });
});

describe('computeDirectDebts (FR-6.3)', () => {
  test('reports who owes whom per expense without global simplification', () => {
    // single payer a, splits b & c owe 100 each
    const txns: BalanceTransaction[] = [
      {
        payers: [{ memberId: 'a', amountMinorUnits: 200 }],
        splits: [
          { memberId: 'b', computedMinorUnits: 100 },
          { memberId: 'c', computedMinorUnits: 100 },
        ],
      },
    ];
    const debts = computeDirectDebts(txns);
    expect(debts).toContainEqual({ fromMemberId: 'b', toMemberId: 'a', amountMinorUnits: 100 });
    expect(debts).toContainEqual({ fromMemberId: 'c', toMemberId: 'a', amountMinorUnits: 100 });
  });

  test('nets pairwise debts between the same two people', () => {
    const txns: BalanceTransaction[] = [
      // a paid for b: b owes a 100
      {
        payers: [{ memberId: 'a', amountMinorUnits: 100 }],
        splits: [{ memberId: 'b', computedMinorUnits: 100 }],
      },
      // b paid for a: a owes b 30
      {
        payers: [{ memberId: 'b', amountMinorUnits: 30 }],
        splits: [{ memberId: 'a', computedMinorUnits: 30 }],
      },
    ];
    // net: b owes a 70
    expect(computeDirectDebts(txns)).toEqual([
      { fromMemberId: 'b', toMemberId: 'a', amountMinorUnits: 70 },
    ]);
  });
});

describe('settle (FR-6.2 / FR-6.3 toggle)', () => {
  const txns: BalanceTransaction[] = [
    {
      payers: [{ memberId: 'a', amountMinorUnits: 300 }],
      splits: [
        { memberId: 'a', computedMinorUnits: 100 },
        { memberId: 'b', computedMinorUnits: 100 },
        { memberId: 'c', computedMinorUnits: 100 },
      ],
    },
  ];

  test('simplify:true uses minimized payments', () => {
    expect(settle(txns, { simplify: true })).toEqual([
      { fromMemberId: 'b', toMemberId: 'a', amountMinorUnits: 100 },
      { fromMemberId: 'c', toMemberId: 'a', amountMinorUnits: 100 },
    ]);
  });

  test('simplify:false uses direct debts', () => {
    const direct = settle(txns, { simplify: false });
    expect(direct).toContainEqual({ fromMemberId: 'b', toMemberId: 'a', amountMinorUnits: 100 });
    expect(direct).toContainEqual({ fromMemberId: 'c', toMemberId: 'a', amountMinorUnits: 100 });
  });
});
