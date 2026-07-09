/**
 * Scheduled notification run (PRD §4.11, FR-12.1).
 *
 * Guarded by the same timing-safe `Bearer $CRON_SECRET` comparison as
 * receipt-cleanup, and scheduled the same way (a Coolify scheduled task).
 * Intended cadence: hourly. Each user's own interval decides whether they are
 * due, so running this more often is harmless and running it late only delays.
 */
import { prisma } from '@evenup/db';
import { createSecretBox, runNotifications } from '@evenup/api';
import { env } from '@/server/env';
import { emailChannel } from '@/server/notification-channel';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(req: Request) {
  const secret = env.cronSecret;
  const auth = req.headers.get('authorization') ?? '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!secret || !timingSafeEqual(provided, secret)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

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
