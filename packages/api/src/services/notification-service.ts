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
  coalesceDigest,
  digestIdempotencyKey,
  isDigestDue,
  reminderIdempotencyKey,
  reminderPayments,
  type ActivityEvent,
} from '@evenup/core';
import type { PrismaClient } from '@evenup/db';
import {
  toNotifiableUser,
  type NotificationChannel,
  type NotificationConfig,
} from '../notifications/types.js';
import type { SecretBox } from '../crypto/secret-box.js';
import { getGroupBalances, type GroupBalanceResult } from './balance-service.js';
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

interface LinkedUser {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly locale: string;
  readonly notificationsEnabled: boolean;
}

interface LinkedMember {
  readonly id: string;
  readonly user: LinkedUser;
}

/**
 * Members of this group that a notification could actually reach. `Member.user`
 * is an optional relation, so Prisma types it nullable regardless of the
 * `userId: { not: null }` filter — narrow with a guard rather than an `as` cast,
 * so a future change to the filter or the select becomes a type error instead of
 * a runtime one.
 */
async function loadLinkedMembers(prisma: PrismaClient, groupId: string): Promise<LinkedMember[]> {
  const rows = await prisma.member.findMany({
    where: { groupId, isActive: true, userId: { not: null } },
    select: {
      id: true,
      user: {
        select: { id: true, email: true, name: true, locale: true, notificationsEnabled: true },
      },
    },
  });
  return rows.filter((m): m is LinkedMember => m.user !== null);
}

/**
 * `getGroupBalances` re-reads a group's entire transaction history. Both the
 * digest and the reminder phase need it, and the digest needs it only if it ends
 * up with something to say — so compute it at most once per group, on demand.
 */
function lazyBalances(prisma: PrismaClient, groupId: string): () => Promise<GroupBalanceResult> {
  let pending: Promise<GroupBalanceResult> | null = null;
  return () => (pending ??= getGroupBalances(prisma, groupId));
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

async function digestGroup(
  args: RunNotificationsArgs,
  group: ActiveGroup,
  members: readonly LinkedMember[],
  balances: () => Promise<GroupBalanceResult>,
): Promise<number> {
  const { prisma, now, config } = args;

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

  let balanceByMember: Map<string, number> | null = null;
  const netFor = async (memberId: string): Promise<number> => {
    balanceByMember ??= new Map(
      (await balances()).balances.map((b) => [b.memberId, b.balanceMinorUnits]),
    );
    return balanceByMember.get(memberId) ?? 0;
  };

  // Watermarks advance in one batched UPDATE at the end, not one per recipient.
  const advanced: string[] = [];
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
      advanced.push(member.user.id);
      continue;
    }

    const outcome = await deliver({
      prisma,
      channels: args.channels,
      user: toNotifiableUser(member.user),
      payload: {
        kind: 'digest',
        groupId: group.id,
        groupName: group.name,
        items: items.map((i) => ({
          action: i.action,
          count: i.count,
          lastAt: i.lastAt.toISOString(),
        })),
        netMinorUnits: await netFor(member.id),
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
      advanced.push(member.user.id);
      if (outcome === 'sent') sent++;
    }
  }
  await advanceWatermarks(prisma, group.id, advanced, now);
  return sent;
}

/**
 * Whether the creditor can be paid by transfer, so the reminder can point at the
 * in-app QR. Resolving the payee decrypts an IBAN, so the result is reduced to a
 * boolean here and the IBAN is never carried into a persisted payload (§9.2).
 */
function hasPayableAccount(
  creditor: Parameters<typeof resolvePayee>[0],
  secretBox: SecretBox,
): boolean {
  try {
    return resolvePayee(creditor, secretBox) !== null;
  } catch (err) {
    // A corrupt or non-CZ stored account must not take down the whole cron; the
    // reminder is still worth sending without pointing at a QR code.
    console.error('[notifications] could not resolve payee for reminder', err);
    return false;
  }
}

async function remindGroup(
  args: RunNotificationsArgs,
  group: ActiveGroup,
  balances: () => Promise<GroupBalanceResult>,
): Promise<number> {
  const { prisma, now, config } = args;
  const { payments } = await balances();
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
      user: toNotifiableUser(debtor.user),
      payload: {
        kind: 'reminder',
        groupId: group.id,
        groupName: group.name,
        creditorName: creditor.displayName,
        amountMinorUnits: payment.amountMinorUnits,
        currency: group.baseCurrency,
        hasQrPayment: hasPayableAccount(creditor, args.secretBox),
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
    // A group of purely virtual members has nobody to reach — neither phase can
    // send anything, so skip both before paying for a balance computation.
    const members = await loadLinkedMembers(args.prisma, group.id);
    if (members.length === 0) continue;

    const balances = lazyBalances(args.prisma, group.id);
    digestsSent += await digestGroup(args, group, members, balances);
    remindersSent += await remindGroup(args, group, balances);
  }

  return { materialized: created, retried, digestsSent, remindersSent };
}
