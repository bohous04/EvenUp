/**
 * Unit tests for `deleteUserAccount`'s selective erasure (GDPR Art. 17 vs Czech
 * accounting-law retention, see doc comment in account.ts): personal data must
 * go, but PURCHASE ledger rows are payment records Czech law requires retaining
 * — Art. 17(3)(b) lets that obligation override the right to erasure, so those
 * rows survive detached from the person (userId set to null).
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDb, testPrisma, createTestUser, makeCaller } from '../test/harness.js';
import type { ObjectStore } from '../storage/object-store.js';
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

/** Capturing store; keys in `throwOnDelete` reject, as a storage outage would. */
function makeCapturingStore(throwOnDelete: Set<string> = new Set()): {
  store: ObjectStore;
  deletedKeys: string[];
} {
  const deletedKeys: string[] = [];
  const store: ObjectStore = {
    async putReceipt() {},
    async deleteObject(key) {
      if (throwOnDelete.has(key)) throw new Error(`simulated delete failure for ${key}`);
      deletedKeys.push(key);
    },
    async getObject() {
      return null;
    },
  };
  return { store, deletedKeys };
}

/**
 * The account's solo group plus a receipt in it, and a second user whose own
 * receipt must survive — the deletion has to be scoped to the person asking.
 */
async function seedSoloGroupWithReceipt() {
  const user = await createTestUser('olivia@example.com');
  const group = await makeCaller(user).group.create({ name: 'Solo', baseCurrency: 'CZK' });
  await testPrisma.receipt.create({
    data: { groupId: group.id, storageKeys: ['receipts/a.jpg', 'receipts/a-page2.jpg'] },
  });
  return { user, group };
}

/**
 * Deleting a solo group cascades its `Receipt` rows, and `receipt-cleanup.ts`
 * only ever iterates rows that still exist — so a key not captured before the
 * cascade is an S3 object nothing in the system can ever reach again. For a
 * user erased inside the retention window that means their receipt photos stay
 * in storage indefinitely, which is precisely what GDPR Art. 17 forbids.
 */
describe('deleteUserAccount: receipt images in deleted groups (GDPR Art. 17)', () => {
  it('hands every storage key of a cascaded solo group to the object store', async () => {
    const { user } = await seedSoloGroupWithReceipt();
    const { store, deletedKeys } = makeCapturingStore();

    await deleteUserAccount(testPrisma, user.id, store);

    expect(deletedKeys.sort()).toEqual(['receipts/a-page2.jpg', 'receipts/a.jpg']);
    // The row that held the keys is gone, so this was the only chance to.
    expect(await testPrisma.receipt.count()).toBe(0);
  });

  it('leaves a shared group’s photos alone — they are not the deleted user’s to erase', async () => {
    const olivia = await createTestUser('olivia@example.com');
    const group = await makeCaller(olivia).group.create({ name: 'Shared', baseCurrency: 'CZK' });
    const ben = await createTestUser('ben@example.com');
    await testPrisma.member.create({
      data: { groupId: group.id, displayName: 'Ben', initials: 'B', color: '#111', userId: ben.id },
    });
    await testPrisma.receipt.create({
      data: { groupId: group.id, storageKeys: ['receipts/shared.jpg'] },
    });
    const { store, deletedKeys } = makeCapturingStore();

    await deleteUserAccount(testPrisma, olivia.id, store);

    expect(deletedKeys).toEqual([]);
    // The group survives, so the retention job still owns that photo.
    expect(await testPrisma.receipt.count()).toBe(1);
  });

  it('completes the erasure even when the object store is failing', async () => {
    const { user } = await seedSoloGroupWithReceipt();
    const { store, deletedKeys } = makeCapturingStore(new Set(['receipts/a.jpg']));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(deleteUserAccount(testPrisma, user.id, store)).resolves.toBeUndefined();

    // The failure is logged, and does not strand the receipt's other key.
    expect(warn).toHaveBeenCalled();
    expect(deletedKeys).toEqual(['receipts/a-page2.jpg']);
    expect(await testPrisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    warn.mockRestore();
  });

  it('still deletes the account on an instance with no object storage', async () => {
    const { user } = await seedSoloGroupWithReceipt();

    await expect(deleteUserAccount(testPrisma, user.id)).resolves.toBeUndefined();

    expect(await testPrisma.user.findUnique({ where: { id: user.id } })).toBeNull();
  });
});
