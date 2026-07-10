/**
 * Scheduled notification run (PRD §4.11, FR-12.1).
 *
 * Guarded by the same shared bearer-token check as receipt-cleanup, and
 * scheduled the same way (a Coolify scheduled task). Intended cadence: hourly.
 * Each user's own interval decides whether they are due, so running this more
 * often is harmless and running it late only delays.
 */
import { prisma } from '@evenup/db';
import { createSecretBox, runNotifications } from '@evenup/api';
import { rejectUnauthorizedCron } from '@/server/cron-auth';
import { env } from '@/server/env';
import { emailChannel } from '@/server/notification-channel';

export async function POST(req: Request) {
  const unauthorized = rejectUnauthorizedCron(req);
  if (unauthorized) return unauthorized;

  try {
    const result = await runNotifications({
      prisma,
      channels: [emailChannel],
      secretBox: createSecretBox(env.encryptionKey),
      now: new Date(),
      config: env.notifications,
    });
    return Response.json(result);
  } catch (err) {
    // Cron is not tRPC, so the ErrorLog middleware does not see this.
    console.error('[notifications] cron run failed', err);
    return Response.json({ error: 'notification run failed' }, { status: 500 });
  }
}
