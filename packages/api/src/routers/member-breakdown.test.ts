/**
 * Integration tests for `balance.memberBreakdown`.
 *
 * Fixture (minor units, three equal-weight members):
 *   E1 "Chata"  90_000 paid by Olivia, EQUAL 3  -> each share 30_000
 *   T  transfer 10_000 Petr -> Olivia           (Petr pays, Olivia receives)
 *   E2 "Hospoda" ITEMIZED paid by Petr:
 *        Pivo  12_000 -> {Olivia, Petr}  (6_000 each)
 *        Gulas 18_900 -> {Olivia}        (18_900)
 *        total 30_900; Olivia share 24_900, Petr share 6_000
 *   Olivia balance = +90_000 -30_000 -10_000 -24_900 = +25_100
 */
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { makeCaller, createTestUser, resetDb, testPrisma } from '../test/harness.js';

beforeAll(async () => {
  await testPrisma.$queryRaw`SELECT 1`;
});
beforeEach(async () => {
  await resetDb();
});

async function seed() {
  const olivia = await createTestUser('olivia@example.com');
  const caller = makeCaller(olivia);
  const group = await caller.group.create({ name: 'Tatry', template: 'TRIP', baseCurrency: 'CZK' });
  const m = {
    olivia: group.members[0]!,
    petr: await caller.member.add({ groupId: group.id, displayName: 'Petr' }),
    jana: await caller.member.add({ groupId: group.id, displayName: 'Jana' }),
  };
  const equal = {
    type: 'EQUAL' as const,
    members: [{ memberId: m.olivia.id }, { memberId: m.petr.id }, { memberId: m.jana.id }],
  };
  await caller.transaction.createExpense({
    groupId: group.id,
    title: 'Chata',
    currency: 'CZK',
    date: new Date('2026-06-20'),
    payers: [{ memberId: m.olivia.id, amountMinorUnits: 90_000 }],
    split: equal,
  });
  await caller.transaction.recordTransfer({
    groupId: group.id,
    fromMemberId: m.petr.id,
    toMemberId: m.olivia.id,
    amountMinorUnits: 10_000,
    currency: 'CZK',
  });
  await caller.transaction.createExpense({
    groupId: group.id,
    title: 'Hospoda',
    currency: 'CZK',
    date: new Date('2026-06-21'),
    payers: [{ memberId: m.petr.id, amountMinorUnits: 30_900 }],
    split: {
      type: 'ITEMIZED',
      items: [
        { name: 'Pivo', totalMinorUnits: 12_000, memberIds: [m.olivia.id, m.petr.id] },
        { name: 'Gulas', totalMinorUnits: 18_900, memberIds: [m.olivia.id] },
      ],
    },
  });
  return { caller, group, m };
}

describe('balance.memberBreakdown', () => {
  test('entries sum to the balance and match balance.get', async () => {
    const { caller, group, m } = await seed();
    const fromCard = (await caller.balance.get({ groupId: group.id })).balances.find(
      (b) => b.memberId === m.olivia.id,
    )!.balanceMinorUnits;

    const bd = await caller.balance.memberBreakdown({ groupId: group.id, memberId: m.olivia.id });
    expect(bd.balanceMinorUnits).toBe(fromCard);
    expect(bd.balanceMinorUnits).toBe(25_100);
    expect(bd.entries.reduce((a, e) => a + e.amountMinorUnits, 0)).toBe(fromCard);
  });

  test('spent/paid cover expenses only, excluding the transfer', async () => {
    const { caller, group, m } = await seed();
    const bd = await caller.balance.memberBreakdown({ groupId: group.id, memberId: m.olivia.id });
    expect(bd.paidMinorUnits).toBe(90_000); // E1 only; transfer not counted
    expect(bd.spentMinorUnits).toBe(30_000 + 24_900); // E1 + E2 shares; transfer excluded
  });

  test('itemized share row exposes the assigned polozky and reconciles', async () => {
    const { caller, group, m } = await seed();
    const bd = await caller.balance.memberBreakdown({ groupId: group.id, memberId: m.olivia.id });
    const hospoda = bd.entries.find((e) => e.title === 'Hospoda' && e.kind === 'share')!;
    expect(hospoda.items).not.toBeNull();
    expect(hospoda.items!.map((i) => [i.name, i.portionMinorUnits])).toEqual([
      ['Pivo', 6_000],
      ['Gulas', 18_900],
    ]);
    // items + remainder == the tx-currency share (24_900); no extra charges -> remainder 0
    expect(hospoda.remainderMinorUnits).toBe(0);
    expect(hospoda.amountMinorUnits).toBe(-24_900);
    expect(hospoda.currency).toBe('CZK');
  });

  test('transfer rows carry a from → to label and no items', async () => {
    const { caller, group, m } = await seed();
    const bd = await caller.balance.memberBreakdown({ groupId: group.id, memberId: m.olivia.id });
    const transfer = bd.entries.find((e) => e.type === 'TRANSFER')!;
    // Olivia's member.displayName is auto-derived from her email local-part
    // (createTestUser doesn't set AuthUser.name), so it stays lowercase — see
    // group.ts's `displayName` fallback. Other fixtures (next-round.test.ts)
    // never assert Olivia's own auto-derived name for the same reason.
    expect(transfer.transferLabel).toBe('Petr → olivia');
    expect(transfer.kind).toBe('share'); // Olivia is the recipient
    expect(transfer.amountMinorUnits).toBe(-10_000);
    expect(transfer.items).toBeNull();
  });

  test('rejects a member id that is not in the group', async () => {
    const { caller, group } = await seed();
    await expect(
      caller.balance.memberBreakdown({ groupId: group.id, memberId: 'not-a-member' }),
    ).rejects.toThrow(/not found/i);
  });

  // Parity guard: memberBreakdown re-derives base allocations from its OWN query,
  // separate from balance.get's (loadBalanceTransactions). `allocateByWeights`
  // breaks largest-remainder ties by lowest array index, so both queries must
  // feed it the nested payer/split rows in the same order — hence the shared
  // `orderBy: { id: 'asc' }` on both. This exercises a genuine tie: same-currency
  // re-allocation is the identity map (order-independent), so only the
  // cross-currency expense below actually stresses the tie-break.
  test('balanceMinorUnits matches balance.get for every member (tie-prone + multi-payer + cross-currency)', async () => {
    const olivia = await createTestUser('olivia@example.com');
    const caller = makeCaller(olivia, {
      fxFetch: async () =>
        ({
          ok: true,
          json: async () => ({ rates: { CZK: 25.5 } }),
          text: async () => '',
        }) as Response,
    });
    const group = await caller.group.create({
      name: 'Ties',
      template: 'TRIP',
      baseCurrency: 'CZK',
    });
    const m = {
      olivia: group.members[0]!,
      petr: await caller.member.add({ groupId: group.id, displayName: 'Petr' }),
      jana: await caller.member.add({ groupId: group.id, displayName: 'Jana' }),
    };
    const equal = {
      type: 'EQUAL' as const,
      members: [{ memberId: m.olivia.id }, { memberId: m.petr.id }, { memberId: m.jana.id }],
    };

    // (1) Non-evenly-divisible EQUAL split: 100 -> 34/33/33 (largest-remainder tie).
    await caller.transaction.createExpense({
      groupId: group.id,
      title: 'Split100',
      currency: 'CZK',
      date: new Date('2026-06-20'),
      payers: [{ memberId: m.olivia.id, amountMinorUnits: 100 }],
      split: equal,
    });
    // (2) Multi-payer expense (payers split 34/33/33 too).
    await caller.transaction.createExpense({
      groupId: group.id,
      title: 'MultiPayer',
      currency: 'CZK',
      date: new Date('2026-06-21'),
      payers: [
        { memberId: m.olivia.id, amountMinorUnits: 34 },
        { memberId: m.petr.id, amountMinorUnits: 33 },
        { memberId: m.jana.id, amountMinorUnits: 33 },
      ],
      split: equal,
    });
    // (3) Cross-currency expense whose BASE re-allocation lands a leftover unit on
    //     a largest-remainder TIE (302 EUR-cents * 25.5 = 7701 CZK base, EQUAL 3 ->
    //     shares 101/101/100 re-allocated over base 7701 -> +1 tie on the two 101s).
    //     Which member gets the +1 depends on nested row order; the fix pins it.
    await caller.transaction.createExpense({
      groupId: group.id,
      title: 'Lanovka',
      currency: 'EUR',
      date: new Date('2026-06-22'),
      payers: [{ memberId: m.olivia.id, amountMinorUnits: 302 }],
      split: equal,
    });

    const card = await caller.balance.get({ groupId: group.id });
    for (const memberId of [m.olivia.id, m.petr.id, m.jana.id]) {
      const fromCard = card.balances.find((b) => b.memberId === memberId)!.balanceMinorUnits;
      const bd = await caller.balance.memberBreakdown({ groupId: group.id, memberId });
      expect(bd.balanceMinorUnits).toBe(fromCard);
      expect(bd.entries.reduce((a, e) => a + e.amountMinorUnits, 0)).toBe(fromCard);
    }
  });
});
