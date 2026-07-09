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
 * entry point here swallows and logs.
 *
 * Recovery is only guaranteed once `deliver()` has written its row: a send that
 * fails after that leaves a `pending`/`failed` row for the cron's retry sweep.
 * A failure *before* it — one of the lookups below throwing — leaves no row and
 * drops the notification, logged and unretried. That is the accepted trade: the
 * settlement itself is already committed, and the user's intent was to record a
 * payment, not to send an email.
 */
import { settlementIdempotencyKey } from '@evenup/core';
import { toMinor, type PrismaClient } from '@evenup/db';
import { toNotifiableUser, type NotificationChannel } from '../notifications/types.js';
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
      user: toNotifiableUser(recipient),
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
    // user's actual intent. If a delivery row was written, the cron's retry
    // sweep picks it up; if we failed before that, this log is the only trace.
    console.error('[notifications] settlement notification failed', err);
  }
}
