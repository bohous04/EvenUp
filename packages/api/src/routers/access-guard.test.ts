/**
 * `assertGroupAccess`/`assertGroupAdmin` require an ACTIVE member link, not
 * just a `userId` match (see access.ts). Before this fix, `member.remove`
 * deactivated an account-linked row (FR-2.4, member.ts) but the access guard
 * still matched on `userId` alone -- so removal revoked nothing: the removed
 * person kept full read/write access and could even reinstate themselves via
 * `member.update`. These pin the fixed contract, and that the creator
 * carve-out (access independent of any member row) still holds.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeCaller, createTestUser, testPrisma, resetDb } from '../test/harness.js';

/** A group owned by `owner@example.com`, plus one other user joined as a member. */
async function setupGroup() {
  const owner = await createTestUser('owner@example.com');
  const ownerCaller = makeCaller(owner);
  const group = await ownerCaller.group.create({
    name: 'Chata',
    template: 'TRIP',
    baseCurrency: 'CZK',
  });
  const invite = await ownerCaller.invite.create({ groupId: group.id });

  const member = await createTestUser('member@example.com');
  const memberCaller = makeCaller(member);
  const memberRow = await memberCaller.invite.claim({ token: invite.token });

  return { owner, ownerCaller, group, member, memberCaller, memberRow };
}

describe('group access requires an active member link', () => {
  beforeEach(resetDb);

  it('refuses a removed (deactivated) member on any assertGroupAccess-guarded procedure', async () => {
    const { ownerCaller, group, memberCaller, memberRow } = await setupGroup();
    await ownerCaller.member.remove({ memberId: memberRow.id });

    await expect(memberCaller.group.get({ groupId: group.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'You are not a member of this group',
    });
  });

  it('a removed member cannot reinstate themselves through member.update', async () => {
    const { ownerCaller, memberCaller, memberRow } = await setupGroup();
    await ownerCaller.member.remove({ memberId: memberRow.id });

    // The removed member is themselves the target of the update -- exactly the
    // self-reinstate call the live repro showed as ALLOWED before this fix.
    await expect(
      memberCaller.member.update({ memberId: memberRow.id, isActive: true }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: 'You are not a member of this group' });

    const stillInactive = await testPrisma.member.findUniqueOrThrow({
      where: { id: memberRow.id },
    });
    expect(stillInactive.isActive).toBe(false);
  });

  it('a removed member no longer sees the group in group.list', async () => {
    const { ownerCaller, group, memberCaller, memberRow } = await setupGroup();
    // Sanity: while still active, the group is listed.
    expect((await memberCaller.group.list()).map((g) => g.id)).toContain(group.id);

    await ownerCaller.member.remove({ memberId: memberRow.id });

    const groups = await memberCaller.group.list();
    expect(groups.map((g) => g.id)).not.toContain(group.id);
  });

  it('the creator keeps access even when their own member row is deactivated', async () => {
    const { ownerCaller, group, owner } = await setupGroup();
    const ownerMember = await testPrisma.member.findFirstOrThrow({
      where: { groupId: group.id, userId: owner.id },
    });
    // Not going through member.remove: the owner is the sole ADMIN, and
    // deactivating their own row directly is the scenario the carve-out
    // exists for -- the group's creator must never be able to lock themselves
    // out.
    await testPrisma.member.update({ where: { id: ownerMember.id }, data: { isActive: false } });

    await expect(ownerCaller.group.get({ groupId: group.id })).resolves.toBeTruthy();
    expect((await ownerCaller.group.list()).map((g) => g.id)).toContain(group.id);
    // The carve-out grants admin access too (assertGroupAdmin), not just read.
    await expect(
      ownerCaller.group.update({ groupId: group.id, name: 'Renamed by owner' }),
    ).resolves.toBeTruthy();
  });

  it('a deactivated ADMIN loses admin rights', async () => {
    const { ownerCaller, group, memberCaller, memberRow } = await setupGroup();
    await ownerCaller.member.update({ memberId: memberRow.id, role: 'ADMIN' });

    // Sanity: an active ADMIN can perform an admin-only action.
    await expect(
      memberCaller.group.update({ groupId: group.id, name: 'Renamed while active' }),
    ).resolves.toBeTruthy();

    await ownerCaller.member.remove({ memberId: memberRow.id });

    await expect(
      memberCaller.group.update({ groupId: group.id, name: 'Renamed after removal' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: 'Admin access required' });
  });
});
