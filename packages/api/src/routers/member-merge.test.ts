/** member.merge — authorization, preflight refusals (spec 2026-07-25). */
import { beforeEach, describe, expect, test } from 'vitest';
import { makeCaller, createTestUser, resetDb } from '../test/harness.js';

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
    await expect(
      makeCaller(user).member.merge({ sourceMemberId: newcomer.id, targetMemberId: creator.id }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
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
