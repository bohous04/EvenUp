/**
 * Integration tests for the notification spine, against an ephemeral Postgres.
 *
 * A `FakeChannel` captures payloads instead of sending them, mirroring the
 * recorded-fixture discipline the OCR adapter uses: no live email in CI.
 */
import { beforeEach, describe, expect, test } from 'vitest';
import { DEFAULT_REMINDER_THRESHOLD_MINOR_UNITS } from '@evenup/core';
import { fromMinor } from '@evenup/db';
import { makeCaller, createTestUser, resetDb, testPrisma, testSecretBox } from '../test/harness.js';
import { runNotifications } from './notification-service.js';
import { notifySettlementRecorded } from './notify.js';
import type {
  NotifiableUser,
  NotificationChannel,
  NotificationConfig,
  NotificationPayload,
} from '../notifications/types.js';

const CONFIG: NotificationConfig = {
  digestIntervalHours: 24,
  reminderIntervalHours: 168,
  reminderThresholdMinorUnits: DEFAULT_REMINDER_THRESHOLD_MINOR_UNITS,
  maxAttempts: 3,
};

interface Captured {
  readonly user: NotifiableUser;
  readonly payload: NotificationPayload;
}

class FakeChannel implements NotificationChannel {
  readonly id = 'email' as const;
  readonly sent: Captured[] = [];
  constructor(private readonly failTimes = 0) {}
  private failures = 0;

  supports(user: NotifiableUser): boolean {
    return !!user.email;
  }

  async send(user: NotifiableUser, payload: NotificationPayload): Promise<void> {
    if (this.failures < this.failTimes) {
      this.failures++;
      throw new Error('provider exploded');
    }
    this.sent.push({ user, payload });
  }
}

const DAY_MS = 86_400_000;

/**
 * A single cron pass can legitimately send one person two different things — a
 * digest AND a reminder. Assertions must therefore count by kind, never by the
 * raw length of everything the channel saw.
 */
const digestsOf = (c: FakeChannel) => c.sent.filter((s) => s.payload.kind === 'digest');
const remindersOf = (c: FakeChannel) => c.sent.filter((s) => s.payload.kind === 'reminder');

/** A group with two linked users, one virtual member, and one expense. */
async function seedGroup(opts: { expensePaidBy?: 'alice' | 'bob' } = {}) {
  const alice = await createTestUser('alice@example.com');
  const bob = await createTestUser('bob@example.com');
  const group = await testPrisma.group.create({
    data: { name: 'Ski Trip', baseCurrency: 'CZK', createdById: alice.id },
  });
  const mkMember = (displayName: string, userId?: string) =>
    testPrisma.member.create({
      data: { groupId: group.id, displayName, initials: displayName[0]!, color: '#111', userId },
    });
  const aliceM = await mkMember('Alice', alice.id);
  const bobM = await mkMember('Bob', bob.id);
  const ghost = await mkMember('Ghost'); // virtual: no account, unreachable
  return { alice, bob, group, aliceM, bobM, ghost, opts };
}

/** Backdate a user's watermark so their digest is due. */
async function makeDigestDue(userId: string, groupId: string, daysAgo = 2) {
  await testPrisma.notificationPreference.upsert({
    where: { userId_groupId: { userId, groupId } },
    create: { userId, groupId, lastDigestAt: new Date(Date.now() - daysAgo * DAY_MS) },
    update: { lastDigestAt: new Date(Date.now() - daysAgo * DAY_MS) },
  });
}

async function addExpense(
  groupId: string,
  actorId: string,
  payerMemberId: string,
  memberIds: string[],
  total: number,
) {
  const txn = await testPrisma.transaction.create({
    data: {
      groupId,
      type: 'EXPENSE',
      title: 'Lift pass',
      currency: 'CZK',
      totalMinorUnits: fromMinor(total),
      baseMinorUnits: fromMinor(total),
      date: new Date(),
      splitType: 'EQUAL',
      createdById: actorId,
      payers: { create: [{ memberId: payerMemberId, amountMinorUnits: fromMinor(total) }] },
      splits: {
        create: memberIds.map((memberId) => ({
          memberId,
          computedMinorUnits: fromMinor(Math.round(total / memberIds.length)),
        })),
      },
    },
  });
  await testPrisma.activityLog.create({
    data: {
      groupId,
      actorId,
      action: 'expense.created',
      payload: { title: 'Lift pass', transactionId: txn.id },
    },
  });
  return txn;
}

function run(channel: NotificationChannel, config: Partial<NotificationConfig> = {}) {
  return runNotifications({
    prisma: testPrisma,
    channels: [channel],
    secretBox: testSecretBox,
    now: new Date(),
    config: { ...CONFIG, ...config },
  });
}

beforeEach(resetDb);

describe('digest', () => {
  test('a first-seen member is initialized, not mailed the group history', async () => {
    const { group, alice, aliceM, bobM } = await seedGroup();
    await addExpense(group.id, alice.id, aliceM.id, [aliceM.id, bobM.id], 10_000);

    const channel = new FakeChannel();
    const result = await run(channel);

    expect(result.digestsSent).toBe(0);
    expect(digestsOf(channel)).toHaveLength(0);
    const prefs = await testPrisma.notificationPreference.findMany({
      where: { groupId: group.id },
    });
    expect(prefs).toHaveLength(2);
    expect(prefs.every((p) => p.lastDigestAt !== null)).toBe(true);
  });

  test('sends a digest of activity the recipient did not cause', async () => {
    const { group, alice, bob, aliceM, bobM } = await seedGroup();
    await makeDigestDue(alice.id, group.id);
    await makeDigestDue(bob.id, group.id);
    await addExpense(group.id, alice.id, aliceM.id, [aliceM.id, bobM.id], 10_000);

    const channel = new FakeChannel();
    const result = await run(channel);

    // Alice caused the only event, so only Bob hears about it.
    expect(result.digestsSent).toBe(1);
    const digests = digestsOf(channel);
    expect(digests).toHaveLength(1);
    const [only] = digests;
    expect(only!.user.email).toBe('bob@example.com');
    expect(only!.payload.kind).toBe('digest');
    if (only!.payload.kind !== 'digest') throw new Error('unreachable');
    expect(only!.payload.items).toEqual([
      { action: 'expense.created', count: 1, lastAt: expect.any(String) },
    ]);
    expect(only!.payload.groupName).toBe('Ski Trip');
  });

  test('a transaction-scoped event only reaches its participants', async () => {
    const { group, alice, bob, aliceM, ghost } = await seedGroup();
    await makeDigestDue(bob.id, group.id);
    // Expense between Alice and the virtual member: Bob is not a participant.
    await addExpense(group.id, alice.id, aliceM.id, [aliceM.id, ghost.id], 10_000);

    const channel = new FakeChannel();
    const result = await run(channel);

    expect(result.digestsSent).toBe(0);
    expect(digestsOf(channel)).toHaveLength(0);
  });

  test('group-level events with no transactionId reach everyone', async () => {
    const { group, alice, bob } = await seedGroup();
    await makeDigestDue(bob.id, group.id);
    await testPrisma.activityLog.create({
      data: {
        groupId: group.id,
        actorId: alice.id,
        action: 'member.joined',
        payload: { name: 'Cara' },
      },
    });

    const channel = new FakeChannel();
    expect((await run(channel)).digestsSent).toBe(1);
  });

  test('advances the watermark only on success, and never double-sends', async () => {
    const { group, alice, bob, aliceM, bobM } = await seedGroup();
    await makeDigestDue(bob.id, group.id);
    await addExpense(group.id, alice.id, aliceM.id, [aliceM.id, bobM.id], 10_000);

    const failing = new FakeChannel(1); // fails once, then succeeds
    const first = await run(failing);
    expect(first.digestsSent).toBe(0);

    const pref = await testPrisma.notificationPreference.findUniqueOrThrow({
      where: { userId_groupId: { userId: bob.id, groupId: group.id } },
    });
    // Watermark did NOT move: the digest must be retried, not skipped.
    expect(pref.lastDigestAt!.getTime()).toBeLessThan(Date.now() - DAY_MS);

    const delivery = await testPrisma.notificationDelivery.findFirstOrThrow({
      where: { userId: bob.id, kind: 'digest' },
    });
    expect(delivery.status).toBe('failed');
    expect(delivery.attempts).toBe(1);
    expect(delivery.error).toContain('provider exploded');

    // Second pass: the retry sweep replays the stored payload and succeeds. The
    // digest phase then finds the row already `sent` and repairs the watermark
    // rather than sending a second copy.
    const second = await run(failing);
    expect(digestsOf(failing)).toHaveLength(1);
    expect(second.retried).toBe(1);
    expect(second.digestsSent).toBe(0);
    const after = await testPrisma.notificationDelivery.findFirstOrThrow({
      where: { userId: bob.id, kind: 'digest' },
    });
    expect(after.status).toBe('sent');
    expect(after.attempts).toBe(2);
  });

  test('a duplicate idempotency key repairs the watermark instead of resending', async () => {
    const { group, alice, bob, aliceM, bobM } = await seedGroup();
    await makeDigestDue(bob.id, group.id);
    await addExpense(group.id, alice.id, aliceM.id, [aliceM.id, bobM.id], 10_000);

    const channel = new FakeChannel();
    await run(channel);
    expect(digestsOf(channel)).toHaveLength(1);

    // Simulate a crash after sending but before the watermark advanced.
    await makeDigestDue(bob.id, group.id);
    const again = await run(channel);

    expect(again.digestsSent).toBe(0);
    expect(digestsOf(channel)).toHaveLength(1); // no second email
    const pref = await testPrisma.notificationPreference.findUniqueOrThrow({
      where: { userId_groupId: { userId: bob.id, groupId: group.id } },
    });
    expect(pref.lastDigestAt!.getTime()).toBeGreaterThan(Date.now() - DAY_MS);
  });

  test('respects per-group mute and the global opt-out', async () => {
    const { group, alice, bob, aliceM, bobM } = await seedGroup();
    await makeDigestDue(bob.id, group.id);
    await addExpense(group.id, alice.id, aliceM.id, [aliceM.id, bobM.id], 10_000);
    await testPrisma.notificationPreference.update({
      where: { userId_groupId: { userId: bob.id, groupId: group.id } },
      data: { muted: true },
    });

    const muted = new FakeChannel();
    expect((await run(muted)).digestsSent).toBe(0);
    expect(digestsOf(muted)).toHaveLength(0);

    // Un-mute, but switch off notifications account-wide.
    await testPrisma.notificationPreference.update({
      where: { userId_groupId: { userId: bob.id, groupId: group.id } },
      data: { muted: false },
    });
    await testPrisma.user.update({ where: { id: bob.id }, data: { notificationsEnabled: false } });

    const optedOut = new FakeChannel();
    expect((await run(optedOut)).digestsSent).toBe(0);
  });

  test('an archived group is silent', async () => {
    const { group, alice, bob, aliceM, bobM } = await seedGroup();
    await makeDigestDue(bob.id, group.id);
    await addExpense(group.id, alice.id, aliceM.id, [aliceM.id, bobM.id], 10_000);
    await testPrisma.group.update({ where: { id: group.id }, data: { archivedAt: new Date() } });

    expect((await run(new FakeChannel())).digestsSent).toBe(0);
  });
});

describe('reminders', () => {
  test('reminds the debtor, never the creditor, and never a virtual member', async () => {
    const { group, alice, aliceM, bobM } = await seedGroup();
    // Alice paid 10 000; Bob owes her 5 000 — at the threshold.
    await addExpense(group.id, alice.id, aliceM.id, [aliceM.id, bobM.id], 10_000);

    const channel = new FakeChannel();
    const result = await run(channel);

    expect(result.remindersSent).toBe(1);
    const [reminder] = remindersOf(channel);
    expect(reminder!.user.email).toBe('bob@example.com');
    if (reminder!.payload.kind !== 'reminder') throw new Error('unreachable');
    expect(reminder!.payload.creditorName).toBe('Alice');
    expect(reminder!.payload.amountMinorUnits).toBe(5_000);
    expect(reminder!.payload.currency).toBe('CZK');
    // Alice has saved no bank account, so there is no QR to point at.
    expect(reminder!.payload.hasQrPayment).toBe(false);
  });

  test('debts below the threshold are not worth an email', async () => {
    const { group, alice, aliceM, bobM } = await seedGroup();
    await addExpense(group.id, alice.id, aliceM.id, [aliceM.id, bobM.id], 600); // Bob owes 300

    expect((await run(new FakeChannel())).remindersSent).toBe(0);
  });

  test('flags a QR payment when the creditor has a payable account, without leaking the IBAN', async () => {
    const { group, alice, aliceM, bobM } = await seedGroup();
    await testPrisma.user.update({
      where: { id: alice.id },
      data: { bankAccountEncrypted: testSecretBox.encrypt('19-2000145399/0800') },
    });
    await addExpense(group.id, alice.id, aliceM.id, [aliceM.id, bobM.id], 10_000);

    const channel = new FakeChannel();
    await run(channel);
    const [reminder] = remindersOf(channel);
    if (reminder!.payload.kind !== 'reminder') throw new Error('unreachable');
    expect(reminder!.payload.hasQrPayment).toBe(true);

    // The persisted payload must never carry the creditor's IBAN (§9.2): SPAYD
    // embeds it, and delivery rows are stored in cleartext for retry replay.
    const stored = await testPrisma.notificationDelivery.findFirstOrThrow({
      where: { kind: 'reminder' },
    });
    const serialized = JSON.stringify(stored.payload);
    expect(serialized).not.toMatch(/CZ\d{2}/); // an IBAN, not the "CZK" currency
    expect(serialized).not.toContain('SPD*');
    expect(serialized).not.toContain('2000145399');
  });

  test('sends at most one reminder per creditor per window', async () => {
    const { group, alice, aliceM, bobM } = await seedGroup();
    await addExpense(group.id, alice.id, aliceM.id, [aliceM.id, bobM.id], 10_000);

    const channel = new FakeChannel();
    expect((await run(channel)).remindersSent).toBe(1);
    expect((await run(channel)).remindersSent).toBe(0);
    expect(remindersOf(channel)).toHaveLength(1);
  });
});

describe('immediate lane', () => {
  test('tells the payee, and only the payee, about a recorded settlement', async () => {
    const { group, bob, aliceM, bobM } = await seedGroup();
    const channel = new FakeChannel();
    // Bob records paying Alice: Alice is the one who wants to know.
    const caller = makeCaller(bob, { notificationChannels: [channel] });
    await caller.transaction.recordTransfer({
      groupId: group.id,
      fromMemberId: bobM.id,
      toMemberId: aliceM.id,
      amountMinorUnits: 5_000,
      currency: 'CZK',
      method: 'BANK',
    });

    expect(channel.sent).toHaveLength(1);
    const [sent] = channel.sent;
    expect(sent!.user.email).toBe('alice@example.com');
    if (sent!.payload.kind !== 'settlement.received') throw new Error('unreachable');
    expect(sent!.payload.payerName).toBe('Bob');
    expect(sent!.payload.amountMinorUnits).toBe(5_000);
  });

  test('does not notify someone about a settlement they recorded themselves', async () => {
    const { group, alice, aliceM, bobM } = await seedGroup();
    const channel = new FakeChannel();
    // Alice records that Bob paid her — she already knows.
    const caller = makeCaller(alice, { notificationChannels: [channel] });
    await caller.transaction.recordTransfer({
      groupId: group.id,
      fromMemberId: bobM.id,
      toMemberId: aliceM.id,
      amountMinorUnits: 5_000,
      currency: 'CZK',
      method: 'CASH',
    });

    expect(channel.sent).toHaveLength(0);
  });

  test('a virtual payee is unreachable and records no delivery', async () => {
    const { group, alice, aliceM, ghost } = await seedGroup();
    const channel = new FakeChannel();
    const caller = makeCaller(alice, { notificationChannels: [channel] });
    await caller.transaction.recordTransfer({
      groupId: group.id,
      fromMemberId: aliceM.id,
      toMemberId: ghost.id,
      amountMinorUnits: 5_000,
      currency: 'CZK',
      method: 'CASH',
    });

    expect(channel.sent).toHaveLength(0);
    expect(await testPrisma.notificationDelivery.count()).toBe(0);
  });

  test('a failing channel never fails the mutation', async () => {
    const { group, bob, aliceM, bobM } = await seedGroup();
    const alwaysFails = new FakeChannel(Number.MAX_SAFE_INTEGER);
    const caller = makeCaller(bob, { notificationChannels: [alwaysFails] });

    await expect(
      caller.transaction.recordTransfer({
        groupId: group.id,
        fromMemberId: bobM.id,
        toMemberId: aliceM.id,
        amountMinorUnits: 5_000,
        currency: 'CZK',
        method: 'BANK',
      }),
    ).resolves.toBeTruthy();

    const delivery = await testPrisma.notificationDelivery.findFirstOrThrow();
    expect(delivery.status).toBe('failed');
  });

  test('is idempotent per settlement transaction', async () => {
    const { group, bob, aliceM, bobM } = await seedGroup();
    const channel = new FakeChannel();
    const caller = makeCaller(bob, { notificationChannels: [channel] });
    const txn = await caller.transaction.recordTransfer({
      groupId: group.id,
      fromMemberId: bobM.id,
      toMemberId: aliceM.id,
      amountMinorUnits: 5_000,
      currency: 'CZK',
      method: 'BANK',
    });

    await notifySettlementRecorded({
      prisma: testPrisma,
      channels: [channel],
      transactionId: txn.id,
      now: new Date(),
    });

    expect(channel.sent).toHaveLength(1);
  });
});

describe('recurring materialization', () => {
  test('runs from the cron and lands in the digest as a system event', async () => {
    const { group, alice, bob, aliceM, bobM } = await seedGroup();
    await makeDigestDue(bob.id, group.id);
    const template = await addExpense(group.id, alice.id, aliceM.id, [aliceM.id, bobM.id], 10_000);
    await testPrisma.transaction.update({
      where: { id: template.id },
      data: {
        recurrenceInterval: 'daily',
        date: new Date(Date.now() - 3 * DAY_MS),
        recurrenceLastRun: new Date(Date.now() - 3 * DAY_MS),
      },
    });
    // Remove the seeded activity row so only materialized events remain.
    await testPrisma.activityLog.deleteMany({ where: { groupId: group.id } });

    const channel = new FakeChannel();
    const result = await run(channel);

    expect(result.materialized).toBe(3);
    const [digest] = digestsOf(channel);
    if (!digest || digest.payload.kind !== 'digest') throw new Error('expected a digest');
    // Actor is null (the schedule did it), so it is never excluded as "your own".
    expect(digest.payload.items).toEqual([
      { action: 'expense.created', count: 3, lastAt: expect.any(String) },
    ]);
  });
});
