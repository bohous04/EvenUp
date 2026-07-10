/**
 * Idempotent notification delivery + the retry sweep.
 *
 * The `NotificationDelivery` row is written BEFORE the send is attempted, and
 * its `idempotencyKey` is UNIQUE. A cron run that crashes between "sent" and
 * "recorded as sent" therefore cannot double-send: the retry collides on the
 * index and finds a row already marked `sent`.
 */
import type { Prisma, PrismaClient } from '@evenup/db';
import {
  toNotifiableUser,
  type NotifiableUser,
  type NotificationChannel,
  type NotificationPayload,
} from '../notifications/types.js';

/** Outcome of a single delivery attempt. `duplicate` means somebody already sent it. */
export type DeliveryOutcome = 'sent' | 'duplicate' | 'failed' | 'dead' | 'unreachable';

const PRISMA_UNIQUE_VIOLATION = 'P2002';
const ERROR_MAX_LENGTH = 500;

/**
 * Structural check, deliberately NOT `err instanceof PrismaClientKnownRequestError`.
 *
 * Under Next's bundler this module and the `PrismaClient` instance that throws
 * can resolve to different copies of `@prisma/client`, so the constructor
 * identities differ and `instanceof` is false — the collision would escape as an
 * unhandled 500 instead of being read as "already delivered". Integration tests
 * share one module realm and never see it; the deployed cron does.
 */
export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === PRISMA_UNIQUE_VIOLATION
  );
}

function describe(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.slice(0, ERROR_MAX_LENGTH);
}

function pickChannel(
  channels: readonly NotificationChannel[],
  user: NotifiableUser,
): NotificationChannel | null {
  return channels.find((c) => c.supports(user)) ?? null;
}

async function attemptSend(
  prisma: PrismaClient,
  channel: NotificationChannel,
  user: NotifiableUser,
  payload: NotificationPayload,
  deliveryId: string,
  now: Date,
): Promise<'sent' | 'failed'> {
  try {
    await channel.send(user, payload);
  } catch (err) {
    await prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: { status: 'failed', attempts: { increment: 1 }, error: describe(err) },
    });
    console.error(`[notifications] send failed for delivery ${deliveryId}`, err);
    return 'failed';
  }
  await prisma.notificationDelivery.update({
    where: { id: deliveryId },
    data: { status: 'sent', attempts: { increment: 1 }, sentAt: now, error: null },
  });
  return 'sent';
}

export interface DeliverArgs {
  readonly prisma: PrismaClient;
  readonly channels: readonly NotificationChannel[];
  readonly user: NotifiableUser;
  readonly payload: NotificationPayload;
  readonly idempotencyKey: string;
  readonly now: Date;
  readonly maxAttempts: number;
}

/**
 * Send a notification at most once. Safe to call repeatedly with the same key:
 * a already-`sent` row short-circuits to `duplicate`, and a `pending`/`failed`
 * row is retried until `maxAttempts`.
 */
export async function deliver(args: DeliverArgs): Promise<DeliveryOutcome> {
  const channel = pickChannel(args.channels, args.user);
  if (!channel) return 'unreachable';

  let deliveryId: string;
  try {
    const created = await args.prisma.notificationDelivery.create({
      data: {
        userId: args.user.id,
        kind: args.payload.kind,
        channel: channel.id,
        idempotencyKey: args.idempotencyKey,
        status: 'pending',
        payload: args.payload as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    deliveryId = created.id;
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // Someone (an earlier run, or a concurrent one) already claimed this key.
    const existing = await args.prisma.notificationDelivery.findUnique({
      where: { idempotencyKey: args.idempotencyKey },
      select: { id: true, status: true, attempts: true },
    });
    if (!existing || existing.status === 'sent') return 'duplicate';
    if (existing.attempts >= args.maxAttempts) return 'dead';
    deliveryId = existing.id;
  }

  return attemptSend(args.prisma, channel, args.user, args.payload, deliveryId, args.now);
}

export interface RetrySweepArgs {
  readonly prisma: PrismaClient;
  readonly channels: readonly NotificationChannel[];
  readonly now: Date;
  readonly maxAttempts: number;
  /** Safety cap so one bad run cannot stall the whole cron. */
  readonly limit?: number;
}

/**
 * Re-send deliveries stranded by a crash or a transient provider failure. The
 * stored `payload` is replayed verbatim, so a retried digest says exactly what
 * the failed one would have said.
 */
export async function retryStalledDeliveries(
  args: RetrySweepArgs,
): Promise<{ retried: number; sent: number }> {
  const stalled = await args.prisma.notificationDelivery.findMany({
    where: { status: { in: ['pending', 'failed'] }, attempts: { lt: args.maxAttempts } },
    orderBy: { createdAt: 'asc' },
    take: args.limit ?? 200,
    include: {
      user: {
        select: { id: true, email: true, name: true, locale: true, notificationsEnabled: true },
      },
    },
  });

  let retried = 0;
  let sent = 0;
  for (const row of stalled) {
    // A user who opted out between the failure and the retry is not chased.
    if (!row.user.notificationsEnabled) continue;
    const user = toNotifiableUser(row.user);
    const channel = pickChannel(args.channels, user);
    if (!channel) continue;
    retried++;
    const outcome = await attemptSend(
      args.prisma,
      channel,
      user,
      row.payload as unknown as NotificationPayload,
      row.id,
      args.now,
    );
    if (outcome === 'sent') sent++;
  }
  return { retried, sent };
}
