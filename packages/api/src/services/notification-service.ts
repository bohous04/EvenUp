/**
 * The notification cron (PRD §4.11, FR-11.1/FR-11.2, FR-12.1).
 *
 * Phases run in order, and the order matters:
 *   1. materialize — today's recurring expense must exist before the digest that
 *      should mention it is built.
 *   2. retry       — sweep deliveries stranded by an earlier crash, BEFORE this
 *      run creates any new ones (so a fresh failure is not retried twice in a
 *      single pass, burning two of its three attempts).
 *   3. digest      — coalesced per (user, group), gated on a watermark.
 *   4. remind      — computed from balances; never reads the event log.
 *
 * The scheduler stays dumb: run this hourly and let each user's interval decide
 * whether they are due.
 */
import {
  buildSpayd,
  coalesceDigest,
  digestIdempotencyKey,
  isDigestDue,
  reminderIdempotencyKey,
  reminderPayments,
  type ActivityEvent,
} from '@evenup/core';
import type { PrismaClient } from '@evenup/db';
import type {
  NotifiableUser,
  NotificationChannel,
  NotificationConfig,
} from '../notifications/types.js';
import type { SecretBox } from '../crypto/secret-box.js';
import { getGroupBalances } from './balance-service.js';
import { materializeRecurring } from './recurring-service.js';
import { deliver, retryStalledDeliveries } from './notification-delivery.js';
import { resolvePayee } from './payee.js';

export interface RunNotificationsArgs {
  readonly prisma: PrismaClient;
  readonly channels: readonly NotificationChannel[];
  readonly secretBox: SecretBox;
  readonly now: Date;
  readonly config: NotificationConfig;
}

export interface NotificationRunResult {
  readonly materialized: number;
  readonly retried: number;
  readonly digestsSent: number;
  readonly remindersSent: number;
}

interface ActiveGroup {
  readonly id: string;
  readonly name: string;
  readonly baseCurrency: string;
}

type LinkedMember = {
  id: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    locale: string;
    notificationsEnabled: boolean;
  };
};

function toNotifiable(user: LinkedMember['user']): NotifiableUser {
  return { id: user.id, email: user.email, name: user.name, locale: user.locale };
}

/** `transactionId` is stamped into the payload by every transaction-scoped activity. */
function transactionIdOf(payload: unknown): string | null {
  if (payload && typeof payload === 'object' && 'transactionId' in payload) {
    const value = (payload as { transactionId: unknown }).transactionId;
    if (typeof value === 'string') return value;
  }
  return null;
}

/**
 * Who each transaction touches — payers and beneficiaries alike. Built once per
 * digest window rather than per recipient; this is a batch job, so resolving
 * "does this affect me" lazily here costs nothing and keeps the mutation path
 * free of recipient fan-out.
 */
async function loadParticipants(
  prisma: PrismaClient,
  transactionIds: readonly string[],
): Promise<Map<string, Set<string>>> {
  const participants = new Map<string, Set<string>>();
  if (transactionIds.length === 0) return participants;

  const add = (transactionId: string, memberId: string) => {
    const set = participants.get(transactionId) ?? new Set<string>();
    set.add(memberId);
    participants.set(transactionId, set);
  };

  const [payers, splits] = await Promise.all([
    prisma.transactionPayer.findMany({
      where: { transactionId: { in: [...transactionIds] } },
      select: { transactionId: true, memberId: true },
    }),
    prisma.transactionSplit.findMany({
      where: { transactionId: { in: [...transactionIds] } },
      select: { transactionId: true, memberId: true },
    }),
  ]);
  for (const p of payers) add(p.transactionId, p.memberId);
  for (const s of splits) add(s.transactionId, s.memberId);
  return participants;
}

/**
 * A transaction-scoped event reaches only its participants. Everything else —
 * a member joining, a category, a renamed group — is group news for everybody.
 * An event whose transaction has since been deleted has no participant set, so
 * it degrades to group news rather than vanishing.
 */
function affectsMember(
  payload: unknown,
  memberId: string,
  participants: Map<string, Set<string>>,
): boolean {
  const transactionId = transactionIdOf(payload);
  if (!transactionId) return true;
  const set = participants.get(transactionId);
  if (!set) return true;
  return set.has(memberId);
}

async function advanceWatermarks(
  prisma: PrismaClient,
  groupId: string,
  userIds: readonly string[],
  now: Date,
): Promise<void> {
  if (userIds.length === 0) return;
  await prisma.notificationPreference.updateMany({
    where: { groupId, userId: { in: [...userIds] } },
    data: { lastDigestAt: now },
  });
}

async function digestGroup(args: RunNotificationsArgs, group: ActiveGroup): Promise<number> {
  const { prisma, now, config } = args;

  const members = (await prisma.member.findMany({
    where: { groupId: group.id, isActive: true, userId: { not: null } },
    select: {
      id: true,
      user: {
        select: { id: true, email: true, name: true, locale: true, notificationsEnabled: true },
      },
    },
  })) as LinkedMember[];
  if (members.length === 0) return 0;

  const prefs = await prisma.notificationPreference.findMany({
    where: { groupId: group.id, userId: { in: members.map((m) => m.user.id) } },
  });
  const prefByUser = new Map(prefs.map((p) => [p.userId, p]));

  // A member we have never seen is initialized at `now`, not mailed the group's
  // entire history. They become eligible one interval from here.
  const uninitialized = members.filter((m) => !prefByUser.has(m.user.id));
  if (uninitialized.length > 0) {
    await prisma.notificationPreference.createMany({
      data: uninitialized.map((m) => ({
        userId: m.user.id,
        groupId: group.id,
        lastDigestAt: now,
      })),
      skipDuplicates: true,
    });
  }

  const due = members.filter((m) => {
    const pref = prefByUser.get(m.user.id);
    if (!pref || pref.muted || !m.user.notificationsEnabled) return false;
    return isDigestDue({
      lastDigestAt: pref.lastDigestAt,
      now,
      intervalHours: config.digestIntervalHours,
    });
  });
  if (due.length === 0) return 0;

  const earliest = new Date(
    Math.min(...due.map((m) => prefByUser.get(m.user.id)!.lastDigestAt!.getTime())),
  );
  const events = await prisma.activityLog.findMany({
    where: { groupId: group.id, createdAt: { gt: earliest } },
    orderBy: { createdAt: 'asc' },
    select: { actorId: true, action: true, payload: true, createdAt: true },
  });

  if (events.length === 0) {
    await advanceWatermarks(
      prisma,
      group.id,
      due.map((m) => m.user.id),
      now,
    );
    return 0;
  }

  const participants = await loadParticipants(
    prisma,
    events.map((e) => transactionIdOf(e.payload)).filter((id): id is string => id !== null),
  );
  const { balances } = await getGroupBalances(prisma, group.id);
  const balanceByMember = new Map(balances.map((b) => [b.memberId, b.balanceMinorUnits]));

  let sent = 0;
  for (const member of due) {
    const pref = prefByUser.get(member.user.id)!;
    const mine: ActivityEvent[] = events
      .filter(
        (e) =>
          e.createdAt > pref.lastDigestAt! && affectsMember(e.payload, member.id, participants),
      )
      .map((e) => ({ action: e.action, actorId: e.actorId, createdAt: e.createdAt }));

    // `coalesceDigest` drops the recipient's own actions; system events survive.
    const items = coalesceDigest(mine, { excludeActorId: member.user.id });
    if (items.length === 0) {
      await advanceWatermarks(prisma, group.id, [member.user.id], now);
      continue;
    }

    const outcome = await deliver({
      prisma,
      channels: args.channels,
      user: toNotifiable(member.user),
      payload: {
        kind: 'digest',
        groupId: group.id,
        groupName: group.name,
        items: items.map((i) => ({
          action: i.action,
          count: i.count,
          lastAt: i.lastAt.toISOString(),
        })),
        netMinorUnits: balanceByMember.get(member.id) ?? 0,
        currency: group.baseCurrency,
      },
      idempotencyKey: digestIdempotencyKey(
        member.user.id,
        group.id,
        now,
        config.digestIntervalHours,
      ),
      now,
      maxAttempts: config.maxAttempts,
    });

    // `duplicate` means an earlier run already sent it and crashed before
    // advancing the watermark. Advancing now is a repair, not a skip.
    if (outcome === 'sent' || outcome === 'duplicate') {
      await advanceWatermarks(prisma, group.id, [member.user.id], now);
      if (outcome === 'sent') sent++;
    }
  }
  return sent;
}

function spaydFor(
  creditor: Parameters<typeof resolvePayee>[0],
  secretBox: SecretBox,
  amountMinorUnits: number,
  currency: string,
  message: string,
): string | null {
  try {
    const payee = resolvePayee(creditor, secretBox);
    if (!payee) return null;
    return buildSpayd({
      iban: payee.iban,
      amountMinorUnits,
      currency,
      message: message.slice(0, 60),
      recipientName: payee.recipientName,
      variableSymbol: payee.variableSymbol,
    });
  } catch (err) {
    // A corrupt or non-CZ stored account must not take down the whole cron; the
    // reminder is still worth sending without a QR code.
    console.error('[notifications] could not build SPAYD for reminder', err);
    return null;
  }
}

async function remindGroup(args: RunNotificationsArgs, group: ActiveGroup): Promise<number> {
  const { prisma, now, config } = args;
  const { payments } = await getGroupBalances(prisma, group.id);
  const owed = reminderPayments(payments, config.reminderThresholdMinorUnits);
  if (owed.length === 0) return 0;

  const memberIds = [...new Set(owed.flatMap((p) => [p.fromMemberId, p.toMemberId]))];
  const members = await prisma.member.findMany({
    where: { id: { in: memberIds } },
    select: {
      id: true,
      displayName: true,
      bankDetail: { select: { ibanEncrypted: true, recipientName: true, variableSymbol: true } },
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          locale: true,
          notificationsEnabled: true,
          bankAccountEncrypted: true,
        },
      },
    },
  });
  const byId = new Map(members.map((m) => [m.id, m]));

  const debtorUserIds = owed
    .map((p) => byId.get(p.fromMemberId)?.user?.id)
    .filter((id): id is string => !!id);
  const muted = new Set(
    (
      await prisma.notificationPreference.findMany({
        where: { groupId: group.id, userId: { in: debtorUserIds }, muted: true },
        select: { userId: true },
      })
    ).map((p) => p.userId),
  );

  let sent = 0;
  for (const payment of owed) {
    const debtor = byId.get(payment.fromMemberId);
    const creditor = byId.get(payment.toMemberId);
    // Virtual members have no account and no address — structurally unreachable.
    if (!debtor?.user || !creditor) continue;
    if (!debtor.user.notificationsEnabled || muted.has(debtor.user.id)) continue;

    const outcome = await deliver({
      prisma,
      channels: args.channels,
      user: toNotifiable(debtor.user),
      payload: {
        kind: 'reminder',
        groupId: group.id,
        groupName: group.name,
        creditorName: creditor.displayName,
        amountMinorUnits: payment.amountMinorUnits,
        currency: group.baseCurrency,
        spayd: spaydFor(
          creditor,
          args.secretBox,
          payment.amountMinorUnits,
          group.baseCurrency,
          group.name,
        ),
      },
      idempotencyKey: reminderIdempotencyKey(
        debtor.user.id,
        group.id,
        creditor.id,
        now,
        config.reminderIntervalHours,
      ),
      now,
      maxAttempts: config.maxAttempts,
    });
    if (outcome === 'sent') sent++;
  }
  return sent;
}

/** Run every notification phase. Safe to invoke concurrently; keys deduplicate. */
export async function runNotifications(args: RunNotificationsArgs): Promise<NotificationRunResult> {
  const { created } = await materializeRecurring({ prisma: args.prisma, now: args.now });

  const { retried } = await retryStalledDeliveries({
    prisma: args.prisma,
    channels: args.channels,
    now: args.now,
    maxAttempts: args.config.maxAttempts,
  });

  const groups: ActiveGroup[] = await args.prisma.group.findMany({
    where: { archivedAt: null },
    select: { id: true, name: true, baseCurrency: true },
  });

  let digestsSent = 0;
  let remindersSent = 0;
  for (const group of groups) {
    digestsSent += await digestGroup(args, group);
    remindersSent += await remindGroup(args, group);
  }

  return { materialized: created, retried, digestsSent, remindersSent };
}
