/** Append a localized-by-the-client activity log entry. (PRD §4.9) */
import type { Prisma, PrismaClient } from '@evenup/db';
import { ACTIVITY_PAYLOAD_FIELDS } from '@evenup/i18n';

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

/**
 * Narrow a stored payload to the fields a client actually renders before it
 * leaves the server.
 *
 * The log is written by a dozen call sites and read back as opaque JSON, so
 * "return what we stored" quietly makes every future `logActivity` argument
 * group-visible. Allow-listing inverts that: a new field is invisible until
 * someone adds it to `ACTIVITY_PAYLOAD_FIELDS`, next to the renderer that
 * consumes it.
 */
export function pickActivityPayload(payload: unknown): Record<string, unknown> {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return {};
  const stored = payload as Record<string, unknown>;
  const safe: Record<string, unknown> = {};
  for (const field of ACTIVITY_PAYLOAD_FIELDS) {
    if (stored[field] !== undefined) safe[field] = stored[field];
  }
  return safe;
}
