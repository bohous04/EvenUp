/** Delete receipt images past the retention window (PRD §4.5, FR-5.8). */
import type { PrismaClient } from '@evenup/db';
import type { ObjectStore } from '../storage/object-store.js';

export async function cleanupExpiredReceipts(args: {
  prisma: PrismaClient;
  objectStore: ObjectStore;
  retentionDays: number;
  now: Date;
}): Promise<{ deleted: number }> {
  if (args.retentionDays <= 0) return { deleted: 0 };
  const cutoff = new Date(args.now.getTime() - args.retentionDays * 86_400_000);
  const expired = await args.prisma.receipt.findMany({
    where: { createdAt: { lt: cutoff }, storageKeys: { isEmpty: false } },
    select: { id: true, storageKeys: true },
  });
  let deleted = 0;
  for (const r of expired) {
    try {
      // With multiple keys, a failure partway through re-runs this receipt from
      // key 0 on the next daily run. That only converges (rather than re-deleting
      // forever) because S3 DeleteObject is idempotent: deleting an already-gone
      // key is not an error, so the retry just re-confirms the earlier keys.
      for (const key of r.storageKeys) {
        await args.objectStore.deleteObject(key);
      }
    } catch (err) {
      // Delete failed: do NOT clear storageKeys, so the next daily run retries.
      console.warn(`[receipt-cleanup] delete failed for ${r.id}, will retry`, err);
      continue;
    }
    await args.prisma.receipt.update({ where: { id: r.id }, data: { storageKeys: [] } });
    deleted++;
  }
  return { deleted };
}
