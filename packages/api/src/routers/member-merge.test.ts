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
  // The merge transaction takes `FOR UPDATE` on `source` as its very first
  // statement (member.ts), before any of the reads/moves below. Every
  // FK-referencing insert (TransactionPayer, TransactionSplit,
  // ItemAssignment, and Transaction.from/toMemberId all reference Member)
  // must first take `FOR KEY SHARE` on the same row, which conflicts with
  // `FOR UPDATE` -- so a competing writer that names `source` while our
  // transaction is open cannot land invisibly. It can only:
  //   (a) already have committed before we took the lock -- in which case
  //       our own reads (taken after the lock) already see it and merge it
  //       normally, or
  //   (b) still be in flight when we commit -- in which case it blocks on
  //       our lock and, once we commit having deleted `source`, wakes up to
  //       find the row gone and fails with a foreign-key violation
  //       (Postgres 23503 / Prisma P2003) instead of landing on it.
  //
  // These tests pin outcome (b) deterministically: a Prisma client
  // extension hooks the FIRST read the merge transaction makes after taking
  // the lock (`tx.transactionPayer.findMany`) and, right there, fires a
  // competing write on a genuinely separate connection (`caller`, backed by
  // `testPrisma`). Critically the write is NOT awaited inline -- awaiting it
  // would serialize it behind the very lock it needs to race against and
  // deadlock the (single-threaded) merge transaction against itself. Left
  // to run concurrently, it reliably loses the race (the merge transaction
  // has far fewer remaining statements before commit than the competing
  // write has before its own first locking insert) and we inspect the
  // outcome once both have settled.
  //
  // Because the lock is taken on the Member row itself, one lock covers
  // every FK path uniformly -- including BankDetail, which the row-count
  // guard below deliberately does not count. That also means the row-count
  // guard can no longer be tripped by a real race once this lock is in
  // place (nothing can commit a reference to `source` while we hold it, and
  // anything that committed earlier is already reflected in our own reads);
  // it is retained purely as a belt-and-braces self-consistency assertion,
  // not exercised as a concurrency guard by these tests.
  function raceAfterLock<T>(
    source: { id: string },
    buildRacer: () => Promise<T>,
  ): { racyPrisma: PrismaClient; getRacer: () => Promise<T> | null } {
    let racer: Promise<T> | null = null;
    const racyPrisma = testPrisma.$extends({
      query: {
        transactionPayer: {
          async findMany({ args, query }) {
            const where = args.where as { memberId?: string };
            if (!racer && where.memberId === source.id) {
              racer = buildRacer();
            }
            return query(args);
          },
        },
      },
    });
    return { racyPrisma: racyPrisma as unknown as PrismaClient, getRacer: () => racer };
  }

  test('a payer + transfer-endpoint write that lands mid-merge is rejected, not lost', async () => {
    const { olivia, caller, group, creator, marek, jana } = await seed();
    // recordTransfer names `source` (jana) as BOTH the payer (fromMemberId)
    // and a transfer endpoint in one call -- this is the pairing the guard's
    // `transactionPayer` and `transaction` (from/toMemberId) counts exist for.
    const { racyPrisma, getRacer } = raceAfterLock(jana, () =>
      caller.transaction.recordTransfer({
        groupId: group.id,
        fromMemberId: jana.id,
        toMemberId: creator.id,
        amountMinorUnits: 12300,
        currency: 'CZK',
        date: new Date('2026-06-24'),
        note: 'Concurrent settlement',
      }),
    );
    const racyCallerFactory = createCallerFactory(appRouter);
    const racyCaller = racyCallerFactory(
      createContext({ prisma: racyPrisma, user: olivia, secretBox: testSecretBox }),
    );

    await expect(
      racyCaller.member.merge({ sourceMemberId: jana.id, targetMemberId: marek.id }),
    ).resolves.toMatchObject({ merged: true });

    // Prove the race actually happened -- otherwise this test would pass
    // vacuously (lock never exercised) -- and that it lost cleanly: no
    // TRPCError with a swallowed cause, a real FK violation.
    expect(getRacer()).not.toBeNull();
    await expect(getRacer()).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      cause: expect.objectContaining({ code: 'P2003' }),
    });
    expect(await testPrisma.member.findUnique({ where: { id: jana.id } })).toBeNull();
    // The whole nested write (Transaction + TransactionPayer) rolled back
    // together -- nothing from the racing settlement survives anywhere.
    expect(
      await testPrisma.transaction.findFirst({
        where: { groupId: group.id, title: 'Concurrent settlement' },
      }),
    ).toBeNull();
  });

  test('a split write (source named only as a beneficiary) that lands mid-merge is rejected, not lost', async () => {
    const { olivia, caller, group, creator, marek, jana } = await seed();
    // jana is a split beneficiary but NOT a payer here, isolating the
    // `transactionSplit` count arm from the payer arm covered above.
    const { racyPrisma, getRacer } = raceAfterLock(jana, () =>
      caller.transaction.createExpense({
        groupId: group.id,
        title: 'Race split',
        currency: 'CZK',
        date: new Date('2026-06-24'),
        payers: [{ memberId: creator.id, amountMinorUnits: 10000 }],
        split: { type: 'EQUAL', members: [{ memberId: creator.id }, { memberId: jana.id }] },
      }),
    );
    const racyCallerFactory = createCallerFactory(appRouter);
    const racyCaller = racyCallerFactory(
      createContext({ prisma: racyPrisma, user: olivia, secretBox: testSecretBox }),
    );

    await expect(
      racyCaller.member.merge({ sourceMemberId: jana.id, targetMemberId: marek.id }),
    ).resolves.toMatchObject({ merged: true });

    expect(getRacer()).not.toBeNull();
    await expect(getRacer()).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      cause: expect.objectContaining({ code: 'P2003' }),
    });
    expect(await testPrisma.member.findUnique({ where: { id: jana.id } })).toBeNull();
    expect(
      await testPrisma.transaction.findFirst({ where: { groupId: group.id, title: 'Race split' } }),
    ).toBeNull();
  });

  test('an item-assignment write that lands mid-merge is rejected, not lost', async () => {
    const { olivia, caller, group, creator, marek, jana } = await seed();
    // jana is assigned a receipt item -- this exercises `itemAssignment`,
    // the guard's fourth arm. ITEMIZED splits compute a TransactionSplit row
    // from item assignments, so this single nested write also touches
    // TransactionSplit for jana; Postgres happens to report that FK first
    // (it's created before receiptItems/assignments in the nested-write
    // order), but the whole write -- item assignment included -- rolls back
    // as one unit, which the assertions below confirm directly.
    const { racyPrisma, getRacer } = raceAfterLock(jana, () =>
      caller.transaction.createExpense({
        groupId: group.id,
        title: 'Race item',
        currency: 'CZK',
        date: new Date('2026-06-24'),
        payers: [{ memberId: creator.id, amountMinorUnits: 2490 }],
        split: {
          type: 'ITEMIZED',
          items: [{ name: 'Mléko', totalMinorUnits: 2490, memberIds: [jana.id] }],
        },
      }),
    );
    const racyCallerFactory = createCallerFactory(appRouter);
    const racyCaller = racyCallerFactory(
      createContext({ prisma: racyPrisma, user: olivia, secretBox: testSecretBox }),
    );

    await expect(
      racyCaller.member.merge({ sourceMemberId: jana.id, targetMemberId: marek.id }),
    ).resolves.toMatchObject({ merged: true });

    expect(getRacer()).not.toBeNull();
    await expect(getRacer()).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      cause: expect.objectContaining({ code: 'P2003' }),
    });
    expect(await testPrisma.member.findUnique({ where: { id: jana.id } })).toBeNull();
    expect(
      await testPrisma.transaction.findFirst({ where: { groupId: group.id, title: 'Race item' } }),
    ).toBeNull();
    // No item-assignment row for jana survives either -- direct proof this
    // arm's write was rolled back, not just the split it happens to share
    // an INSERT statement with.
    expect(await testPrisma.itemAssignment.findMany({ where: { memberId: jana.id } })).toHaveLength(
      0,
    );
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
    // The EXACT split's own basis (exactMinorUnits) must be summed too, not
    // just the derived computedMinorUnits -- this is the one call site that
    // actually exercises sumNullableBigInt with two non-null bigints.
    expect(splits[0]!.exactMinorUnits).toBe(50000n);

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

describe('member.mergePreview', () => {
  test('refuses to preview a merge for a group the caller is not a member of', async () => {
    const { marek, jana } = await seed();
    // A real user who simply never joins the group -- no member link, not
    // the creator -- so assertGroupAccess's FORBIDDEN branch is the only way
    // this can fail.
    const outsider = await createTestUser('outsider@example.com');
    await expect(
      makeCaller(outsider).member.mergePreview({
        sourceMemberId: jana.id,
        targetMemberId: marek.id,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  test('refuses to preview a merge of a member into itself', async () => {
    const { caller, marek } = await seed();
    await expect(
      caller.member.mergePreview({ sourceMemberId: marek.id, targetMemberId: marek.id }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  test('reports what will move and the resulting balance', async () => {
    const { caller, group, creator, marek, jana } = await seed();
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

    const preview = await caller.member.mergePreview({
      sourceMemberId: jana.id,
      targetMemberId: marek.id,
    });

    expect(preview.sourceName).toBe('Jana');
    expect(preview.targetName).toBe('Marek');
    expect(preview.transactionCount).toBe(1);
    expect(preview.movingBalanceMinorUnits).toBe(-30000);
    expect(preview.resultingBalanceMinorUnits).toBe(-60000);
    expect(preview.baseCurrency).toBe('CZK');
    expect(preview.blockingTransfers).toEqual([]);
  });

  test('surfaces blocking transfers instead of throwing', async () => {
    const { caller, group, marek, jana } = await seed();
    // `note` becomes the transaction's title — recordTransfer has no `title`.
    await caller.transaction.recordTransfer({
      groupId: group.id,
      fromMemberId: jana.id,
      toMemberId: marek.id,
      amountMinorUnits: 50000,
      currency: 'CZK',
      date: new Date('2026-06-23'),
      note: 'Vyrovnání',
    });

    const preview = await caller.member.mergePreview({
      sourceMemberId: jana.id,
      targetMemberId: marek.id,
    });
    expect(preview.blockingTransfers).toHaveLength(1);
    expect(preview.blockingTransfers[0]!.title).toBe('Vyrovnání');
  });
});

describe('member.duplicateCandidates', () => {
  test('pairs a freshly joined member with a same-named unclaimed placeholder', async () => {
    const { caller, group, marek } = await seed();
    const { member: newcomer } = await joinAsNew(group.id, caller, 'marek@example.com');

    const candidates = await caller.member.duplicateCandidates({ groupId: group.id });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.sourceMemberId).toBe(newcomer.id);
    expect(candidates[0]!.targetMemberId).toBe(marek.id);
  });

  test('does not pair members with unrelated names', async () => {
    const { caller, group } = await seed();
    await joinAsNew(group.id, caller, 'zdenek@example.com');
    const candidates = await caller.member.duplicateCandidates({ groupId: group.id });
    expect(candidates).toEqual([]);
  });

  test('returns nothing once every placeholder is claimed', async () => {
    const { caller, group, marek, jana } = await seed();
    await caller.member.remove({ memberId: jana.id });
    const { member: newcomer } = await joinAsNew(group.id, caller, 'marek@example.com');
    await caller.member.merge({ sourceMemberId: newcomer.id, targetMemberId: marek.id });

    const candidates = await caller.member.duplicateCandidates({ groupId: group.id });
    expect(candidates).toEqual([]);
  });

  // The brief predates a fix to nameSimilarity: it originally scored ANY
  // shared token as strong evidence, so two different people sharing a
  // common Czech surname ("Jan Novák" vs "Petr Novák") scored 0.9 — as high
  // as a true positive — which would have routinely proposed merging two
  // different people's financial history. Pin the corrected behaviour: a
  // surname-only match must stay below DUPLICATE_MATCH_THRESHOLD (0.8).
  test('does not pair two different people who merely share a surname', async () => {
    const { caller, group } = await seed();
    await caller.member.add({ groupId: group.id, displayName: 'Jan Novák' });
    await joinAsNew(group.id, caller, 'petr.novak@example.com');
    // joinAsNew derives the newcomer's displayName from the email
    // local-part via invite.claim, so this newcomer is "petr.novak".
    // nameSimilarity folds punctuation before comparing, so "petr.novak" vs
    // "Jan Novák" is exactly the surname-only case: leading tokens "petr" /
    // "jan" differ, only the trailing "novak" token is shared — the same
    // 0.588 score as "Petr Novák" vs "Jan Novák" in the brief's own table,
    // safely below DUPLICATE_MATCH_THRESHOLD (0.8).
    const candidates = await caller.member.duplicateCandidates({ groupId: group.id });
    expect(candidates).toEqual([]);
  });
});
