/**
 * FR-8.3 — the per-group FX rate lock. `Group.fxLockedRate` existed in the
 * schema and was consumed by `resolveRateDecimal`, but nothing ever wrote it,
 * so the whole feature was unreachable. These tests pin both halves: that
 * `group.update` can set and clear the lock, and that a locked rate actually
 * wins over the cached daily rate when an expense is created.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Prisma } from '@evenup/db';
import { makeCaller, createTestUser, resetDb, testPrisma } from '../test/harness.js';

const EXPENSE_DATE = new Date('2026-06-22');

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
    name: 'Eurotrip',
    template: 'TRIP',
    baseCurrency: 'CZK',
  });
  const oliviaM = group.members[0]!;
  const petr = await caller.member.add({ groupId: group.id, displayName: 'Petr' });
  return { caller, group, m: { olivia: oliviaM, petr } };
}

/** 100.00 EUR, paid by Olivia, split equally with Petr. */
function eurExpense(groupId: string, payerId: string, memberIds: string[]) {
  return {
    groupId,
    title: 'Hotel',
    currency: 'EUR',
    date: EXPENSE_DATE,
    payers: [{ memberId: payerId, amountMinorUnits: 10_000 }],
    split: { type: 'EQUAL' as const, members: memberIds.map((id) => ({ memberId: id })) },
  };
}

/** A cached daily rate, as the FX provider would have written it. */
async function seedCachedRate(rate: string) {
  await testPrisma.fxRate.create({
    data: {
      base: 'CZK',
      quote: 'EUR',
      rate: new Prisma.Decimal(rate),
      date: new Date(Date.UTC(2026, 5, 22)),
      source: 'frankfurter',
    },
  });
}

describe('group.update — FX rate lock (FR-8.3)', () => {
  it('persists a locked rate on the group', async () => {
    const { caller, group } = await seedGroup();

    await caller.group.update({ groupId: group.id, fxLockedRate: '25.5' });

    const stored = await testPrisma.group.findUniqueOrThrow({ where: { id: group.id } });
    expect(stored.fxLockedRate?.toString()).toBe('25.5');
  });

  it('clears the lock when fxLockedRate is null', async () => {
    const { caller, group } = await seedGroup();
    await caller.group.update({ groupId: group.id, fxLockedRate: '25.5' });

    await caller.group.update({ groupId: group.id, fxLockedRate: null });

    const stored = await testPrisma.group.findUniqueOrThrow({ where: { id: group.id } });
    expect(stored.fxLockedRate).toBeNull();
  });

  it('changes the group base currency', async () => {
    const { caller, group } = await seedGroup();

    await caller.group.update({ groupId: group.id, baseCurrency: 'EUR' });

    const stored = await testPrisma.group.findUniqueOrThrow({ where: { id: group.id } });
    expect(stored.baseCurrency).toBe('EUR');
  });

  it('rejects a locked rate that is not a positive decimal', async () => {
    const { caller, group } = await seedGroup();

    await expect(
      caller.group.update({ groupId: group.id, fxLockedRate: 'not-a-rate' }),
    ).rejects.toThrow();
    await expect(caller.group.update({ groupId: group.id, fxLockedRate: '-3' })).rejects.toThrow();
  });
});

describe('createExpense — locked rate resolution order (FR-8.3)', () => {
  it('uses the locked rate instead of the cached daily rate', async () => {
    const { caller, group, m } = await seedGroup();
    await seedCachedRate('20');
    await caller.group.update({ groupId: group.id, fxLockedRate: '25' });

    const tx = await caller.transaction.createExpense(
      eurExpense(group.id, m.olivia.id, [m.olivia.id, m.petr.id]),
    );

    // 100.00 EUR at 25 = 2500.00 CZK
    expect(tx.exchangeRateToBase.toString()).toBe('25');
    expect(Number(tx.baseMinorUnits)).toBe(250_000);
  });

  it('still prefers an explicit per-expense override over the lock', async () => {
    const { caller, group, m } = await seedGroup();
    await seedCachedRate('20');
    await caller.group.update({ groupId: group.id, fxLockedRate: '25' });

    const tx = await caller.transaction.createExpense({
      ...eurExpense(group.id, m.olivia.id, [m.olivia.id, m.petr.id]),
      exchangeRateToBase: '30',
    });

    // 100.00 EUR at 30 = 3000.00 CZK, and the override is flagged as such
    expect(tx.exchangeRateToBase.toString()).toBe('30');
    expect(Number(tx.baseMinorUnits)).toBe(300_000);
    expect(tx.fxRateOverridden).toBe(true);
  });

  it('falls back to the cached daily rate once the lock is cleared', async () => {
    const { caller, group, m } = await seedGroup();
    await seedCachedRate('20');
    await caller.group.update({ groupId: group.id, fxLockedRate: '25' });
    await caller.group.update({ groupId: group.id, fxLockedRate: null });

    const tx = await caller.transaction.createExpense(
      eurExpense(group.id, m.olivia.id, [m.olivia.id, m.petr.id]),
    );

    // back to 100.00 EUR at 20 = 2000.00 CZK
    expect(tx.exchangeRateToBase.toString()).toBe('20');
    expect(Number(tx.baseMinorUnits)).toBe(200_000);
  });
});
