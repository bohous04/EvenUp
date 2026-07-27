import { prisma } from '@evenup/db';
import { cleanupExpiredReceipts, purgeExpiredSessions } from '@evenup/api';
import { rejectUnauthorizedCron } from '@/server/cron-auth';
import { env } from '@/server/env';
import { getObjectStore } from '@/server/object-store';

export async function POST(req: Request) {
  const unauthorized = rejectUnauthorizedCron(req);
  if (unauthorized) return unauthorized;

  // Both jobs are idempotent, so a 500 here is safe to retry: re-deleting an
  // already-gone S3 key is a no-op, and a second session purge simply matches
  // no rows.
  const now = new Date();
  try {
    const { deleted } = await cleanupExpiredReceipts({
      prisma,
      objectStore: getObjectStore(),
      retentionDays: env.receiptRetentionDays,
      now,
    });
    // Expired sessions hold an IP address and user agent that nothing else
    // ever deletes (GDPR storage limitation).
    const { deleted: sessionsPurged } = await purgeExpiredSessions(prisma, now);
    return Response.json({ deleted, sessionsPurged });
  } catch (err) {
    console.error('[receipt-cleanup] failed', err);
    return Response.json({ error: 'cleanup failed' }, { status: 500 });
  }
}
