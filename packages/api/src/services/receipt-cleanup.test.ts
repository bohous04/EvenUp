/**
 * Integration tests for `cleanupExpiredReceipts` (PRD §4.5, FR-5.8): expired
 * receipt images get deleted from object storage and their `storageKey`
 * cleared, best-effort even if the store call throws.
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

  it('still clears storageKey and counts the row when deleteObject throws (best-effort)', async () => {
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

    expect(result.deleted).toBe(1);
    const after = await testPrisma.receipt.findUniqueOrThrow({ where: { id: oldReceipt.id } });
    expect(after.storageKey).toBe('');
  });
});
