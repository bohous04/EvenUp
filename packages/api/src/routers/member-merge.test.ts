/** member.merge — authorization, preflight refusals (spec 2026-07-25). */
import { beforeEach, describe, expect, test } from 'vitest';
import { makeCaller, createTestUser, resetDb, testPrisma, testSecretBox } from '../test/harness.js';
import { createContext } from '../context.js';
import { createCallerFactory } from '../trpc.js';
import { appRouter } from '../root.js';
import type { PrismaClient } from '@evenup/db';

beforeEach(resetDb);

async function seed() {
  const olivia = await createTestUser('olivia@example.com');
  const caller = makeCaller(olivia);
  const group = await caller.group.create({
    name: 'Tatry 2026',
    template: 'TRIP',
    baseCurrency: 'CZK',
  });
  const marek = await caller.member.add({ groupId: group.id, displayName: 'Marek' });
  const jana = await caller.member.add({ groupId: group.id, displayName: 'Jana' });
  return { olivia, caller, group, creator: group.members[0]!, marek, jana };
}

/** Sign a user up and have them join the group as a brand-new member. */
async function joinAsNew(groupId: string, caller: ReturnType<typeof makeCaller>, email: string) {
  const invite = await caller.invite.create({ groupId });
  const user = await createTestUser(email);
  const member = await makeCaller(user).invite.claim({ token: invite.token });
  return { user, member };
}

/** Sign a user up (or reuse one) and have them claim a specific existing placeholder member. */
async function claimPlaceholder(
  groupId: string,
  caller: ReturnType<typeof makeCaller>,
  user: Awaited<ReturnType<typeof createTestUser>>,
  memberId: string,
) {
  const invite = await caller.invite.create({ groupId });
  return makeCaller(user).invite.claim({ token: invite.token, memberId });
}

describe('member.merge preflight', () => {
  test('refuses to merge a member into itself', async () => {
    const { caller, marek } = await seed();
    await expect(
      caller.member.merge({ sourceMemberId: marek.id, targetMemberId: marek.id }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  test('refuses members from different groups', async () => {
    const { caller, marek } = await seed();
    const other = await caller.group.create({ name: 'Jiná', template: 'OTHER', baseCurrency: 'CZK' });
    await expect(
      caller.member.merge({ sourceMemberId: marek.id, targetMemberId: other.members[0]!.id }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  test('refuses when both members are linked to different accounts', async () => {
    const { caller, group, creator } = await seed();
    const { member: newcomer } = await joinAsNew(group.id, caller, 'marek@example.com');
    await expect(
      caller.member.merge({ sourceMemberId: newcomer.id, targetMemberId: creator.id }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  test('a non-admin may merge their own member into an unclaimed placeholder', async () => {
    const { caller, group, marek } = await seed();
    const { user, member: newcomer } = await joinAsNew(group.id, caller, 'marek@example.com');
    await expect(
      makeCaller(user).member.merge({ sourceMemberId: newcomer.id, targetMemberId: marek.id }),
    ).resolves.toBeTruthy();
  });

  test('a non-admin may not merge a pair that is not theirs', async () => {
    const { caller, group, marek, jana } = await seed();
    const { user } = await joinAsNew(group.id, caller, 'marek@example.com');
    await expect(
      makeCaller(user).member.merge({ sourceMemberId: jana.id, targetMemberId: marek.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  test('a non-admin may not merge into a placeholder that is already claimed', async () => {
    const { caller, group, creator } = await seed();
    const { user, member: newcomer } = await joinAsNew(group.id, caller, 'marek@example.com');
    // NOTE: `creator` is linked to a *different* account than `newcomer`, so
    // this actually exercises the cross-account check, not the "already
    // claimed" guard — see the next test for that branch.
    await expect(
      makeCaller(user).member.merge({ sourceMemberId: newcomer.id, targetMemberId: creator.id }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Both members are linked to different accounts',
    });
  });

  test('a non-admin may not merge two of their own members when the target is already claimed', async () => {
    const { caller, group, marek, jana } = await seed();
    const petr = await createTestUser('petr@example.com');
    // Same non-admin user claims BOTH placeholders, so source.userId ===
    // target.userId === ctx.user.id and the cross-account check does not
    // fire — this is the only way to reach the `target.userId !== null`
    // "already claimed" guard as a non-admin.
    await claimPlaceholder(group.id, caller, petr, marek.id);
    await claimPlaceholder(group.id, caller, petr, jana.id);
    await expect(
      makeCaller(petr).member.merge({ sourceMemberId: marek.id, targetMemberId: jana.id }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: 'Member already claimed' });
  });

  test('blocks the merge when a transfer exists directly between the two members', async () => {
    const { caller, group, marek, jana } = await seed();
    // The procedure is `recordTransfer` (not createTransfer) and has NO `title`
    // field — it stores `title: input.note ?? 'Settlement'`.
    await caller.transaction.recordTransfer({
      groupId: group.id,
      fromMemberId: jana.id,
      toMemberId: marek.id,
      amountMinorUnits: 50000,
      currency: 'CZK',
      date: new Date('2026-06-23'),
      note: 'Vyrovnání',
    });
    await expect(
      caller.member.merge({ sourceMemberId: jana.id, targetMemberId: marek.id }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
});

describe('member.merge concurrency guard', () => {
  test('aborts, and deletes nothing, if a row starts referencing source mid-merge', async () => {
    const { olivia, caller, group, creator, marek, jana } = await seed();

    // We can't reliably win a real race against a background thread from a
    // single-threaded test, so we pin the interleaving deterministically
    // instead: a Prisma client extension hooks the LAST write merge makes
    // before its guard + delete (`tx.member.update` on target) and, right
    // there, commits a competing transfer naming `source` (jana) as an
    // endpoint on a separate connection. Under READ COMMITTED this is exactly
    // what the merge transaction would see if another session's write landed
    // at that instant -- i.e. after the snapshot/sweep, before the delete.
    let injected = false;
    const racyPrisma = testPrisma.$extends({
      query: {
        member: {
          async update({ args, query }) {
            const where = args.where as { id?: string };
            if (!injected && where.id === marek.id) {
              injected = true;
              await caller.transaction.recordTransfer({
                groupId: group.id,
                fromMemberId: jana.id,
                toMemberId: creator.id,
                amountMinorUnits: 12300,
                currency: 'CZK',
                date: new Date('2026-06-24'),
                note: 'Concurrent settlement',
              });
            }
            return query(args);
          },
        },
      },
    });

    const racyCallerFactory = createCallerFactory(appRouter);
    const racyCaller = racyCallerFactory(
      createContext({
        prisma: racyPrisma as unknown as PrismaClient,
        user: olivia,
        secretBox: testSecretBox,
      }),
    );

    await expect(
      racyCaller.member.merge({ sourceMemberId: jana.id, targetMemberId: marek.id }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    // Prove the injected write actually happened -- otherwise this test would
    // pass vacuously (guard never exercised).
    expect(injected).toBe(true);

    // Nothing was destroyed: source survives, and so does the transfer that
    // "arrived late".
    expect(await testPrisma.member.findUnique({ where: { id: jana.id } })).not.toBeNull();
    const transfers = await testPrisma.transaction.findMany({
      where: { groupId: group.id, type: 'TRANSFER', fromMemberId: jana.id },
    });
    expect(transfers).toHaveLength(1);
  });
});

describe('member.merge data movement', () => {
  test('balances are preserved exactly and the source member is gone', async () => {
    const { caller, group, creator, marek, jana } = await seed();
    // Creator pays 900, split equally across all three.
    await caller.transaction.createExpense({
      groupId: group.id,
      title: 'Chata',
      currency: 'CZK',
      date: new Date('2026-06-22'),
      payers: [{ memberId: creator.id, amountMinorUnits: 90000 }],
      split: {
        type: 'EQUAL',
        members: [{ memberId: creator.id }, { memberId: marek.id }, { memberId: jana.id }],
      },
    });

    const before = await caller.balance.get({ groupId: group.id });
    const byId = new Map(before.balances.map((b) => [b.memberId, b.balanceMinorUnits]));
    const expected = byId.get(marek.id)! + byId.get(jana.id)!;

    await caller.member.merge({ sourceMemberId: jana.id, targetMemberId: marek.id });

    const after = await caller.balance.get({ groupId: group.id });
    const afterById = new Map(after.balances.map((b) => [b.memberId, b.balanceMinorUnits]));
    expect(afterById.get(marek.id)).toBe(expected);
    expect(afterById.has(jana.id)).toBe(false);
    expect(await testPrisma.member.findUnique({ where: { id: jana.id } })).toBeNull();

    // The group still nets to zero.
    const total = after.balances.reduce((sum, b) => sum + b.balanceMinorUnits, 0);
    expect(total).toBe(0);
  });

  test('when both members are in the same expense their shares are summed', async () => {
    const { caller, group, creator, marek, jana } = await seed();
    await caller.transaction.createExpense({
      groupId: group.id,
      title: 'Večeře',
      currency: 'CZK',
      date: new Date('2026-06-22'),
      payers: [{ memberId: creator.id, amountMinorUnits: 60000 }],
      split: {
        type: 'EXACT',
        members: [
          { memberId: creator.id, exactMinorUnits: 10000 },
          { memberId: marek.id, exactMinorUnits: 20000 },
          { memberId: jana.id, exactMinorUnits: 30000 },
        ],
      },
    });

    await caller.member.merge({ sourceMemberId: jana.id, targetMemberId: marek.id });

    const splits = await testPrisma.transactionSplit.findMany({
      where: { memberId: marek.id },
    });
    expect(splits).toHaveLength(1);
    expect(Number(splits[0]!.computedMinorUnits)).toBe(50000);

    // The expense's splits still sum to its total.
    const all = await testPrisma.transactionSplit.findMany({
      where: { transactionId: splits[0]!.transactionId },
    });
    const sum = all.reduce((acc, s) => acc + Number(s.computedMinorUnits), 0);
    expect(sum).toBe(60000);
  });

  test('when both members paid the same expense their payments are summed', async () => {
    const { caller, group, creator, marek, jana } = await seed();
    await caller.transaction.createExpense({
      groupId: group.id,
      title: 'Benzín',
      currency: 'CZK',
      date: new Date('2026-06-22'),
      payers: [
        { memberId: marek.id, amountMinorUnits: 40000 },
        { memberId: jana.id, amountMinorUnits: 20000 },
      ],
      split: {
        type: 'EQUAL',
        members: [{ memberId: creator.id }, { memberId: marek.id }, { memberId: jana.id }],
      },
    });

    await caller.member.merge({ sourceMemberId: jana.id, targetMemberId: marek.id });

    const payers = await testPrisma.transactionPayer.findMany({ where: { memberId: marek.id } });
    expect(payers).toHaveLength(1);
    expect(Number(payers[0]!.amountMinorUnits)).toBe(60000);
  });

  test('the target inherits the source account link and keeps its own name', async () => {
    const { caller, group, marek } = await seed();
    const { user, member: newcomer } = await joinAsNew(group.id, caller, 'marek@example.com');

    await caller.member.merge({ sourceMemberId: newcomer.id, targetMemberId: marek.id });

    const merged = await testPrisma.member.findUniqueOrThrow({ where: { id: marek.id } });
    expect(merged.userId).toBe(user.id);
    expect(merged.displayName).toBe('Marek');
  });

  test('records a member.merged activity entry', async () => {
    const { caller, group, marek, jana } = await seed();
    await caller.member.merge({ sourceMemberId: jana.id, targetMemberId: marek.id });
    const logs = await testPrisma.activityLog.findMany({ where: { groupId: group.id } });
    expect(logs.map((l) => l.action)).toContain('member.merged');
  });

  // Once `source` is deleted, its id lives nowhere else -- the activity
  // payload is the only record left to reconstruct an erroneous merge from.
  test('the activity entry payload identifies what was merged, not just display names', async () => {
    const { caller, group, marek } = await seed();
    const { user, member: newcomer } = await joinAsNew(group.id, caller, 'petr@example.com');

    await caller.member.merge({ sourceMemberId: newcomer.id, targetMemberId: marek.id });

    const log = await testPrisma.activityLog.findFirstOrThrow({
      where: { groupId: group.id, action: 'member.merged' },
    });
    expect(log.payload).toMatchObject({
      from: expect.any(String),
      into: 'Marek',
      sourceMemberId: newcomer.id,
      targetMemberId: marek.id,
      sourceUserId: user.id,
    });
  });

  test('when both members share a SHARES split their weights are summed', async () => {
    const { caller, group, creator, marek, jana } = await seed();
    await caller.transaction.createExpense({
      groupId: group.id,
      title: 'Nájem',
      currency: 'CZK',
      date: new Date('2026-06-22'),
      payers: [{ memberId: creator.id, amountMinorUnits: 60000 }],
      split: {
        type: 'SHARES',
        members: [
          { memberId: creator.id, weight: 1 },
          { memberId: marek.id, weight: 2 },
          { memberId: jana.id, weight: 3 },
        ],
      },
    });

    await caller.member.merge({ sourceMemberId: jana.id, targetMemberId: marek.id });

    const splits = await testPrisma.transactionSplit.findMany({ where: { memberId: marek.id } });
    expect(splits).toHaveLength(1);
    expect(splits[0]!.shareWeight).toBe(5);

    // The expense's splits still sum to its total.
    const all = await testPrisma.transactionSplit.findMany({
      where: { transactionId: splits[0]!.transactionId },
    });
    const sum = all.reduce((acc, s) => acc + Number(s.computedMinorUnits), 0);
    expect(sum).toBe(60000);
  });

  test('when both members share a PERCENTAGE split their percentages are summed', async () => {
    const { caller, group, creator, marek, jana } = await seed();
    await caller.transaction.createExpense({
      groupId: group.id,
      title: 'Ubytování',
      currency: 'CZK',
      date: new Date('2026-06-22'),
      payers: [{ memberId: creator.id, amountMinorUnits: 100000 }],
      split: {
        type: 'PERCENTAGE',
        members: [
          { memberId: creator.id, percentage: 40 },
          { memberId: marek.id, percentage: 15.1234 },
          { memberId: jana.id, percentage: 44.8766 },
        ],
      },
    });

    await caller.member.merge({ sourceMemberId: jana.id, targetMemberId: marek.id });

    const splits = await testPrisma.transactionSplit.findMany({ where: { memberId: marek.id } });
    expect(splits).toHaveLength(1);
    // Fits Decimal(7,4) (6 significant digits here) and preserves full
    // precision through the merge -- not just the 2-decimal basis-point
    // rounding used to validate the split summed to 100% at creation time.
    expect(splits[0]!.percentage?.toNumber()).toBe(60);

    const all = await testPrisma.transactionSplit.findMany({
      where: { transactionId: splits[0]!.transactionId },
    });
    const sum = all.reduce((acc, s) => acc + Number(s.computedMinorUnits), 0);
    expect(sum).toBe(100000);
  });
});

describe('member.merge role and isActive', () => {
  test('the surviving member becomes ADMIN if either side was ADMIN', async () => {
    const { caller, marek, jana } = await seed();
    await caller.member.update({ memberId: jana.id, role: 'ADMIN' });

    await caller.member.merge({ sourceMemberId: jana.id, targetMemberId: marek.id });

    const merged = await testPrisma.member.findUniqueOrThrow({ where: { id: marek.id } });
    expect(merged.role).toBe('ADMIN');
  });

  test('the surviving member becomes active if either side was active', async () => {
    const { caller, marek, jana } = await seed();
    // marek (target) is the deactivated placeholder holding the debt; jana
    // (source) is the active member merging into it.
    await caller.member.update({ memberId: marek.id, isActive: false });

    await caller.member.merge({ sourceMemberId: jana.id, targetMemberId: marek.id });

    const merged = await testPrisma.member.findUniqueOrThrow({ where: { id: marek.id } });
    expect(merged.isActive).toBe(true);
  });
});
