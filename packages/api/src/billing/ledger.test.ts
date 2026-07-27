/** Ledger invariants: the balance always equals the sum of deltas. */
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestUser, testPrisma, resetDb } from '../test/harness.js';
import {
  reserveCredit,
  refundCredit,
  recordVipScan,
  creditPurchase,
  countVipScansInPeriod,
} from './ledger.js';

async function balance(userId: string) {
  const u = await testPrisma.user.findUniqueOrThrow({ where: { id: userId } });
  return u.creditBalance;
}

async function ledgerSum(userId: string) {
  const rows = await testPrisma.scanLedger.findMany({ where: { userId } });
  return rows.reduce((n, r) => n + r.delta, 0);
}

describe('ledger', () => {
  beforeEach(resetDb);

  it('refuses to reserve when the balance is zero', async () => {
    const u = await createTestUser('a@example.com');
    expect(await reserveCredit(testPrisma, u.id)).toBe(false);
    expect(await balance(u.id)).toBe(0);
  });

  it('reserves a credit and records it', async () => {
    const u = await createTestUser('a@example.com');
    await testPrisma.user.update({ where: { id: u.id }, data: { creditBalance: 2 } });
    expect(await reserveCredit(testPrisma, u.id)).toBe(true);
    expect(await balance(u.id)).toBe(1);
  });

  it('refunds a reserved credit', async () => {
    const u = await createTestUser('a@example.com');
    await testPrisma.user.update({ where: { id: u.id }, data: { creditBalance: 1 } });
    await reserveCredit(testPrisma, u.id);
    await refundCredit(testPrisma, u.id);
    expect(await balance(u.id)).toBe(1);
  });

  it('never goes negative under concurrent reservations', async () => {
    const u = await createTestUser('a@example.com');
    await testPrisma.user.update({ where: { id: u.id }, data: { creditBalance: 1 } });
    const results = await Promise.all(
      Array.from({ length: 5 }, () => reserveCredit(testPrisma, u.id)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await balance(u.id)).toBe(0);
  });

  it('credits a purchase exactly once for a replayed event', async () => {
    const u = await createTestUser('a@example.com');
    const args = {
      userId: u.id,
      scans: 5,
      stripeEventId: 'evt_1',
      withdrawalConsentAt: new Date(),
    };
    expect(await creditPurchase(testPrisma, args)).toBe(true);
    expect(await creditPurchase(testPrisma, args)).toBe(false);
    expect(await balance(u.id)).toBe(5);
  });

  it('keeps the balance equal to the sum of ledger deltas', async () => {
    const u = await createTestUser('a@example.com');
    await creditPurchase(testPrisma, {
      userId: u.id,
      scans: 3,
      stripeEventId: 'evt_2',
      withdrawalConsentAt: new Date(),
    });
    await reserveCredit(testPrisma, u.id);
    expect(await balance(u.id)).toBe(await ledgerSum(u.id));
  });

  it('counts only VIP scans inside the period', async () => {
    const u = await createTestUser('a@example.com');
    await recordVipScan(testPrisma, u.id);
    const from = new Date(Date.now() - 60_000);
    const to = new Date(Date.now() + 60_000);
    expect(await countVipScansInPeriod(testPrisma, u.id, from, to)).toBe(1);
    const future = new Date(Date.now() + 120_000);
    expect(await countVipScansInPeriod(testPrisma, u.id, future, future)).toBe(0);
  });
});
