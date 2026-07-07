/** Append a localized-by-the-client activity log entry. (PRD §4.9) */
import type { Prisma, PrismaClient } from '@evenup/db';

export async function logActivity(
  prisma: Prisma.TransactionClient | PrismaClient,
  groupId: string,
  actorId: string | null,
  action: string,
  payload?: Prisma.InputJsonValue,
): Promise<void> {
  await prisma.activityLog.create({
    data: { groupId, actorId, action, payload: payload ?? undefined },
  });
}
