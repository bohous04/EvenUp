/** member.merge — authorization, preflight refusals (spec 2026-07-25). */
import { beforeEach, describe, expect, test } from 'vitest';
import { makeCaller, createTestUser, resetDb, testPrisma } from '../test/harness.js';

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
});
