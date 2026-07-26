/**
 * Unit tests for `deleteUserAccount`'s selective erasure (GDPR Art. 17 vs Czech
 * accounting-law retention, see doc comment in account.ts): personal data must
 * go, but PURCHASE ledger rows are payment records Czech law requires retaining
 * — Art. 17(3)(b) lets that obligation override the right to erasure, so those
 * rows survive detached from the person (userId set to null).
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testPrisma, createTestUser } from '../test/harness.js';
import { deleteUserAccount } from './account.js';

beforeAll(async () => {
  await testPrisma.$queryRaw`SELECT 1`;
});

beforeEach(async () => {
  await resetDb();
});

describe('deleteUserAccount: selective erasure (GDPR Art. 17 vs accounting retention)', () => {
  it('retains purchase records but removes personal data on deletion', async () => {
    const u = await createTestUser('a@example.com');
    await testPrisma.scanLedger.createMany({
      data: [
        { userId: u.id, delta: 5, reason: 'PURCHASE', stripeEventId: 'evt_keep' },
        { userId: u.id, delta: -1, reason: 'CREDIT_SCAN' },
        { userId: u.id, delta: 0, reason: 'VIP_SCAN' },
        { userId: u.id, delta: 1, reason: 'REFUND' },
        { userId: u.id, delta: 5, reason: 'ADMIN_GRANT' },
      ],
    });

    await deleteUserAccount(testPrisma, u.id);

    expect(await testPrisma.user.findUnique({ where: { id: u.id } })).toBeNull();

    const remaining = await testPrisma.scanLedger.findMany();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ reason: 'PURCHASE', stripeEventId: 'evt_keep' });
    // The retained record must no longer identify a person.
    expect(remaining[0]!.userId).toBeNull();
    // Every non-PURCHASE reason -- including REFUND (an internal scan-credit
    // reversal, not a Stripe refund) and ADMIN_GRANT -- must be gone.
    const remainingReasons = remaining.map((r) => r.reason);
    expect(remainingReasons).not.toContain('REFUND');
    expect(remainingReasons).not.toContain('ADMIN_GRANT');
  });
});
