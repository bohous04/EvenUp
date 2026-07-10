import { prisma } from '@evenup/db';
import { cleanupExpiredReceipts } from '@evenup/api';
import { rejectUnauthorizedCron } from '@/server/cron-auth';
import { env } from '@/server/env';
import { getObjectStore } from '@/server/object-store';

export async function POST(req: Request) {
  const unauthorized = rejectUnauthorizedCron(req);
  if (unauthorized) return unauthorized;

  try {
    const { deleted } = await cleanupExpiredReceipts({
      prisma,
      objectStore: getObjectStore(),
      retentionDays: env.receiptRetentionDays,
      now: new Date(),
    });
    return Response.json({ deleted });
  } catch (err) {
    console.error('[receipt-cleanup] failed', err);
    return Response.json({ error: 'cleanup failed' }, { status: 500 });
  }
}
