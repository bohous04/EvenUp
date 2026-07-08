/**
 * Integration tests for `cleanupExpiredReceipts` (PRD §4.5, FR-5.8): expired
 * receipt images get deleted from object storage and their `storageKey`
 * cleared only once the delete succeeds. A `deleteObject` failure leaves the
 * row untouched (not counted as deleted) so the next daily run retries,
 * rather than orphaning the object against the 50 GB no-eviction quota.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeCaller, createTestUser, resetDb, testPrisma } from '../test/harness.js';
import { cleanupExpiredReceipts } from './receipt-cleanup.js';
import type { ObjectStore } from '../storage/object-store.js';

beforeAll(async () => {
  await testPrisma.$queryRaw`SELECT 1`;
});

beforeEach(async () => {
  await resetDb();
});

/** Capturing in-memory object store; `throwOnDelete` keys reject deleteObject. */
function makeCapturingStore(throwOnDelete: Set<string> = new Set()): {
  store: ObjectStore;
  objects: Map<string, Uint8Array>;
  deletedKeys: string[];
} {
  const objects = new Map<string, Uint8Array>();
  const deletedKeys: string[] = [];
  const store: ObjectStore = {
    async putReceipt(key, bytes) {
      objects.set(key, bytes);
    },
    async deleteObject(key) {
      if (throwOnDelete.has(key)) throw new Error(`simulated delete failure for ${key}`);
      objects.delete(key);
      deletedKeys.push(key);
    },
    async getObject(key) {
      const bytes = objects.get(key);
      return bytes ? { bytes, contentType: 'image/png' } : null;
    },
  };
  return { store, objects, deletedKeys };
}

async function seedGroup() {
  const user = await createTestUser('olivia@example.com');
  const caller = makeCaller(user);
  const group = await caller.group.create({ name: 'Cleanup', baseCurrency: 'CZK' });
  return { group };
}

describe('cleanupExpiredReceipts (FR-5.8)', () => {
  it('deletes only the receipt older than the retention window', async () => {
    const { group } = await seedGroup();
    const now = new Date();
    const fortyDaysAgo = new Date(now.getTime() - 40 * 86_400_000);

    const oldReceipt = await testPrisma.receipt.create({
      data: {
        groupId: group.id,
        storageKey: 'receipts/old.png',
        status: 'COMPLETED',
        createdAt: fortyDaysAgo,
      },
    });
    const recentReceipt = await testPrisma.receipt.create({
      data: {
        groupId: group.id,
        storageKey: 'receipts/recent.png',
        status: 'COMPLETED',
        createdAt: now,
      },
    });

    const { store, objects, deletedKeys } = makeCapturingStore();
    await store.putReceipt('receipts/old.png', new Uint8Array([1]), 'image/png');
    await store.putReceipt('receipts/recent.png', new Uint8Array([2]), 'image/png');

    const result = await cleanupExpiredReceipts({
      prisma: testPrisma,
      objectStore: store,
      retentionDays: 30,
      now,
    });

    expect(result.deleted).toBe(1);
    expect(deletedKeys).toEqual(['receipts/old.png']);
    expect(objects.has('receipts/old.png')).toBe(false);
    expect(objects.has('receipts/recent.png')).toBe(true);

    const oldAfter = await testPrisma.receipt.findUniqueOrThrow({ where: { id: oldReceipt.id } });
    expect(oldAfter.storageKey).toBe('');

    const recentAfter = await testPrisma.receipt.findUniqueOrThrow({
      where: { id: recentReceipt.id },
    });
    expect(recentAfter.storageKey).toBe('receipts/recent.png');
  });

  it('leaves storageKey untouched and does not count the row when deleteObject throws, so the next run retries', async () => {
    const { group } = await seedGroup();
    const now = new Date();
    const fortyDaysAgo = new Date(now.getTime() - 40 * 86_400_000);

    const oldReceipt = await testPrisma.receipt.create({
      data: {
        groupId: group.id,
        storageKey: 'receipts/flaky.png',
        status: 'COMPLETED',
        createdAt: fortyDaysAgo,
      },
    });

    const { store } = makeCapturingStore(new Set(['receipts/flaky.png']));

    const result = await cleanupExpiredReceipts({
      prisma: testPrisma,
      objectStore: store,
      retentionDays: 30,
      now,
    });

    expect(result.deleted).toBe(0);
    const after = await testPrisma.receipt.findUniqueOrThrow({ where: { id: oldReceipt.id } });
    expect(after.storageKey).toBe('receipts/flaky.png');
  });

  it('clears the key on a later run once the store recovers', async () => {
    const { group } = await seedGroup();
    const now = new Date();
    const fortyDaysAgo = new Date(now.getTime() - 40 * 86_400_000);

    const oldReceipt = await testPrisma.receipt.create({
      data: {
        groupId: group.id,
        storageKey: 'receipts/recovering.png',
        status: 'COMPLETED',
        createdAt: fortyDaysAgo,
      },
    });

    const failing = new Set(['receipts/recovering.png']);
    const { store, deletedKeys } = makeCapturingStore(failing);
    await store.putReceipt('receipts/recovering.png', new Uint8Array([1]), 'image/png');

    const firstRun = await cleanupExpiredReceipts({
      prisma: testPrisma,
      objectStore: store,
      retentionDays: 30,
      now,
    });
    expect(firstRun.deleted).toBe(0);
    const afterFirstRun = await testPrisma.receipt.findUniqueOrThrow({
      where: { id: oldReceipt.id },
    });
    expect(afterFirstRun.storageKey).toBe('receipts/recovering.png');

    // Store recovers (e.g. transient network issue resolved) before the next daily run.
    failing.clear();

    const secondRun = await cleanupExpiredReceipts({
      prisma: testPrisma,
      objectStore: store,
      retentionDays: 30,
      now,
    });
    expect(secondRun.deleted).toBe(1);
    expect(deletedKeys).toEqual(['receipts/recovering.png']);
    const afterSecondRun = await testPrisma.receipt.findUniqueOrThrow({
      where: { id: oldReceipt.id },
    });
    expect(afterSecondRun.storageKey).toBe('');
  });
});
