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
    where: { createdAt: { lt: cutoff }, NOT: { storageKey: '' } },
    select: { id: true, storageKey: true },
  });
  let deleted = 0;
  for (const r of expired) {
    try {
      await args.objectStore.deleteObject(r.storageKey);
    } catch (err) {
      // Delete failed: do NOT clear storageKey, so the next daily run retries.
      // A genuinely-missing object won't throw (S3 delete is idempotent), so
      // this only fires for real failures worth retrying.
      console.warn(`[receipt-cleanup] delete failed for ${r.storageKey}, will retry`, err);
      continue;
    }
    await args.prisma.receipt.update({ where: { id: r.id }, data: { storageKey: '' } });
    deleted++;
  }
  return { deleted };
}
