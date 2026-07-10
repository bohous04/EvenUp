/**
 * Integration tests for `balance.nextPayer` (Next Round, PRD §1.2).
 *
 * Fixture arithmetic, in minor units, three equal-weight members:
 *   E1  900 paid by Olivia, split equally 3 ways
 *   E2  900 paid by Olivia, split equally 3 ways
 *   E3  300 paid by Petr,   split equally 3 ways
 *   total 2 100 -> each owes 700
 *   Olivia +110_000   Petr -40_000   Jana -70_000     (sums to zero)
 *   median of [90_000, 90_000, 30_000] = 90_000 = E
 *   gate (w=1, W=3):  2b*3 + 90_000*2 <= 0  =>  b <= -30_000
 *   Jana (-70_000) and Petr (-40_000) qualify; Olivia does not.
 *   ranked = [Jana, Petr]
 */
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { makeCaller, createTestUser, resetDb, testPrisma } from '../test/harness.js';

beforeAll(async () => {
  await testPrisma.$queryRaw`SELECT 1`;
});

beforeEach(async () => {
  await resetDb();
});

async function seedGroup() {
  const olivia = await createTestUser('olivia@example.com');
  const caller = makeCaller(olivia);
  const group = await caller.group.create({
    name: 'Tatry 2026',
    template: 'TRIP',
    baseCurrency: 'CZK',
  });
  const members = {
    olivia: group.members[0]!,
    petr: await caller.member.add({ groupId: group.id, displayName: 'Petr Svoboda' }),
    jana: await caller.member.add({ groupId: group.id, displayName: 'Jana Dvořáková' }),
  };
  const equalSplit = {
    type: 'EQUAL' as const,
    members: [
      { memberId: members.olivia.id },
      { memberId: members.petr.id },
      { memberId: members.jana.id },
    ],
  };
  const expense = (title: string, payerId: string, amount: number, day: string) =>
    caller.transaction.createExpense({
      groupId: group.id,
      title,
      currency: 'CZK',
      date: new Date(day),
      payers: [{ memberId: payerId, amountMinorUnits: amount }],
      split: equalSplit,
    });
  return { caller, group, members, expense };
}

describe('balance.nextPayer', () => {
  test('hides itself below three expenses', async () => {
    const { caller, group, members, expense } = await seedGroup();
    await expense('Chata', members.olivia.id, 90_000, '2026-06-20');
    await expense('Vlek', members.olivia.id, 90_000, '2026-06-21');

    expect(await caller.balance.nextPayer({ groupId: group.id })).toEqual({ state: 'hidden' });
  });

  test('ranks the qualifying debtors deepest-first and reports the median expense', async () => {
    const { caller, group, members, expense } = await seedGroup();
    await expense('Chata', members.olivia.id, 90_000, '2026-06-20');
    await expense('Vlek', members.olivia.id, 90_000, '2026-06-21');
    await expense('Kava', members.petr.id, 30_000, '2026-06-22');

    const result = await caller.balance.nextPayer({ groupId: group.id });
    expect(result.state).toBe('suggested');
    if (result.state !== 'suggested') throw new Error('unreachable');

    expect(result.typicalExpenseMinorUnits).toBe(90_000);
    expect(result.ranked.map((m) => m.displayName)).toEqual(['Jana Dvořáková', 'Petr Svoboda']);
    expect(result.ranked[0]!.balanceMinorUnits).toBe(-70_000);
    expect(result.ranked[0]!.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  test('never names a deactivated member', async () => {
    const { caller, group, members, expense } = await seedGroup();
    await expense('Chata', members.olivia.id, 90_000, '2026-06-20');
    await expense('Vlek', members.olivia.id, 90_000, '2026-06-21');
    await expense('Kava', members.petr.id, 30_000, '2026-06-22');
    await testPrisma.member.update({ where: { id: members.jana.id }, data: { isActive: false } });

    const result = await caller.balance.nextPayer({ groupId: group.id });
    expect(result.state).toBe('suggested');
    if (result.state !== 'suggested') throw new Error('unreachable');
    expect(result.ranked.map((m) => m.memberId)).not.toContain(members.jana.id);
  });

  test('reports a square group rather than naming anyone', async () => {
    const { caller, group, members, expense } = await seedGroup();
    // Each member pays an identical expense split equally: everyone nets to zero.
    await expense('A', members.olivia.id, 90_000, '2026-06-20');
    await expense('B', members.petr.id, 90_000, '2026-06-21');
    await expense('C', members.jana.id, 90_000, '2026-06-22');

    expect(await caller.balance.nextPayer({ groupId: group.id })).toEqual({ state: 'square' });
  });

  test('hides itself when debts exist but nobody clears the gate', async () => {
    const { caller, group, members, expense } = await seedGroup();
    // Three equal rounds, all paid by Olivia: E = 90_000, W = 3, w = 1, so the gate
    // is b <= -30_000. Before settling: Olivia +180_000, Petr -90_000, Jana -90_000.
    await expense('Chata', members.olivia.id, 90_000, '2026-06-20');
    await expense('Vlek', members.olivia.id, 90_000, '2026-06-21');
    await expense('Kava', members.olivia.id, 90_000, '2026-06-22');

    // Partial settlements are TRANSFERs, not EXPENSEs: they move balances without
    // touching the median or lastPaidAt.
    await caller.transaction.recordTransfer({
      groupId: group.id,
      fromMemberId: members.petr.id,
      toMemberId: members.olivia.id,
      amountMinorUnits: 65_000,
      currency: 'CZK',
    });
    await caller.transaction.recordTransfer({
      groupId: group.id,
      fromMemberId: members.jana.id,
      toMemberId: members.olivia.id,
      amountMinorUnits: 65_000,
      currency: 'CZK',
    });
    // Final: Olivia +50_000, Petr -25_000, Jana -25_000 (sums to zero). Both debtors
    // are shallower than the -30_000 gate, so nobody qualifies -- but the group is
    // not settled either, so the card must not claim "you're all square".
    expect(await caller.balance.nextPayer({ groupId: group.id })).toEqual({ state: 'hidden' });
  });

  test('slices to the 10 most recent expenses for the median', async () => {
    const { caller, group, members, expense } = await seedGroup();
    const dates = [
      '2026-06-10', // oldest -- amount 100_000, must fall outside the window
      '2026-06-11',
      '2026-06-12',
      '2026-06-13',
      '2026-06-14',
      '2026-06-15',
      '2026-06-16',
      '2026-06-17',
      '2026-06-18',
      '2026-06-19',
      '2026-06-20', // most recent
    ];
    // An outlier old enough to fall outside MEDIAN_WINDOW: if the slice were
    // removed (or widened past 10), it would pull the median from 5_000 to 6_000.
    await expense('Outlier', members.olivia.id, 100_000, dates[0]!);
    for (const [i, day] of dates.slice(1).entries()) {
      await expense(`Round ${i + 1}`, members.olivia.id, (i + 1) * 1_000, day);
    }

    const result = await caller.balance.nextPayer({ groupId: group.id });
    expect(result.state).toBe('suggested');
    if (result.state !== 'suggested') throw new Error('unreachable');
    // Lower median of the 10 most recent [1_000, 2_000, ..., 10_000] is 5_000.
    expect(result.typicalExpenseMinorUnits).toBe(5_000);
  });

  test('hides itself for a group with fewer than two active members', async () => {
    const olivia = await createTestUser('solo@example.com');
    const caller = makeCaller(olivia);
    const group = await caller.group.create({
      name: 'Solo',
      template: 'OTHER',
      baseCurrency: 'CZK',
    });
    const me = group.members[0]!;
    for (const [i, day] of ['2026-06-20', '2026-06-21', '2026-06-22'].entries()) {
      await caller.transaction.createExpense({
        groupId: group.id,
        title: `Solo ${i}`,
        currency: 'CZK',
        date: new Date(day),
        payers: [{ memberId: me.id, amountMinorUnits: 90_000 }],
        split: { type: 'EQUAL', members: [{ memberId: me.id }] },
      });
    }
    // Three expenses exist, so this is the member guard firing, not the history guard.
    expect(await caller.balance.nextPayer({ groupId: group.id })).toEqual({ state: 'hidden' });
  });

  test('hides itself for an archived group', async () => {
    const { caller, group, members, expense } = await seedGroup();
    await expense('Chata', members.olivia.id, 90_000, '2026-06-20');
    await expense('Vlek', members.olivia.id, 90_000, '2026-06-21');
    await expense('Kava', members.petr.id, 30_000, '2026-06-22');
    await testPrisma.group.update({ where: { id: group.id }, data: { archivedAt: new Date() } });

    expect(await caller.balance.nextPayer({ groupId: group.id })).toEqual({ state: 'hidden' });
  });
});
