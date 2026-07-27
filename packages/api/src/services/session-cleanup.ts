/**
 * Expired sessions carry personal data — `Session.ipAddress` and
 * `Session.userAgent` — with no reason to keep them once the session is dead.
 * GDPR storage limitation says delete them; nothing else in the app does.
 *
 * Better Auth writes session rows but never prunes them, so without this they
 * accumulate for the life of the deployment: one row per sign-in, each holding
 * an IP address, indefinitely.
 */
import type { PrismaClient } from '@evenup/db';

export async function purgeExpiredSessions(
  prisma: PrismaClient,
  now: Date,
): Promise<{ deleted: number }> {
  const { count } = await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
  return { deleted: count };
}
