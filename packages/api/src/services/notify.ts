/**
 * The immediate notification lane.
 *
 * Exactly one event bypasses the digest: somebody recorded a transfer paying
 * *you*. It is high-signal, time-sensitive, and low-volume, which is the whole
 * bar for interrupting a person by email.
 *
 * ("You were added to a group" was specced as a second immediate, then cut: a
 * `Member` only ever gains a `userId` through `invite.claim`, which the user
 * performs themselves. There is no path by which someone else adds you.)
 *
 * A failed notification must never fail the mutation that triggered it. Every
 * entry point here swallows and logs. The delivery row survives as `pending` or
 * `failed`, and the next cron pass retries it.
 */
import { settlementIdempotencyKey } from '@evenup/core';
import { toMinor, type PrismaClient } from '@evenup/db';
import type { NotificationChannel } from '../notifications/types.js';
import { deliver } from './notification-delivery.js';

/** Matches `NotificationConfig.maxAttempts`; the cron owns the real retry budget. */
const IMMEDIATE_MAX_ATTEMPTS = 3;

export interface NotifySettlementArgs {
  readonly prisma: PrismaClient;
  readonly channels: readonly NotificationChannel[];
  readonly transactionId: string;
  readonly now: Date;
}

/**
 * Tell the payee that a transfer to them was recorded. No-op when the payee is
 * a virtual member, has opted out, or is the person who recorded it.
 */
export async function notifySettlementRecorded(args: NotifySettlementArgs): Promise<void> {
  if (args.channels.length === 0) return;
  try {
    const txn = await args.prisma.transaction.findUnique({
      where: { id: args.transactionId },
      select: {
        id: true,
        totalMinorUnits: true,
        currency: true,
        createdById: true,
        group: { select: { id: true, name: true } },
        fromMember: { select: { displayName: true } },
        toMember: {
          select: {
            displayName: true,
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                locale: true,
                notificationsEnabled: true,
              },
            },
          },
        },
      },
    });

    const recipient = txn?.toMember?.user;
    if (!txn || !recipient || !recipient.notificationsEnabled) return;
    // Don't mail somebody about a settlement they recorded themselves.
    if (txn.createdById === recipient.id) return;

    const muted = await args.prisma.notificationPreference.findUnique({
      where: { userId_groupId: { userId: recipient.id, groupId: txn.group.id } },
      select: { muted: true },
    });
    if (muted?.muted) return;

    await deliver({
      prisma: args.prisma,
      channels: args.channels,
      user: {
        id: recipient.id,
        email: recipient.email,
        name: recipient.name,
        locale: recipient.locale,
      },
      payload: {
        kind: 'settlement.received',
        groupId: txn.group.id,
        groupName: txn.group.name,
        payerName: txn.fromMember?.displayName ?? '',
        amountMinorUnits: Math.abs(toMinor(txn.totalMinorUnits)),
        currency: txn.currency,
      },
      idempotencyKey: settlementIdempotencyKey(recipient.id, txn.id),
      now: args.now,
      maxAttempts: IMMEDIATE_MAX_ATTEMPTS,
    });
  } catch (err) {
    // Swallowed on purpose: recording the settlement succeeded, and that is the
    // user's actual intent. The cron's retry sweep picks up the delivery row.
    console.error('[notifications] settlement notification failed', err);
  }
}
