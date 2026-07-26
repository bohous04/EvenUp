/** An invite cannot be claimed by someone who is already in the group. */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeCaller, createTestUser, testPrisma, resetDb } from '../test/harness.js';

/** A group owned by `owner@example.com`, one unclaimed member, one open invite. */
async function setupInvite() {
  const owner = await createTestUser('owner@example.com');
  const ownerCaller = makeCaller(owner);
  const group = await ownerCaller.group.create({
    name: 'Chata',
    template: 'TRIP',
    baseCurrency: 'CZK',
  });
  const ownerMember = await testPrisma.member.findFirstOrThrow({
    where: { groupId: group.id, userId: owner.id },
  });
  const placeholder = await ownerCaller.member.add({
    groupId: group.id,
    displayName: 'Marek',
  });
  const invite = await ownerCaller.invite.create({ groupId: group.id });
  return { owner, ownerCaller, group, ownerMember, placeholder, invite };
}

describe('invite.claim guards against an existing membership', () => {
  beforeEach(resetDb);

  it('refuses to let an existing member claim a different member', async () => {
    const { ownerCaller, placeholder, invite } = await setupInvite();
    // The owner is already in the group; "Marek" is someone else's placeholder.
    await expect(
      ownerCaller.invite.claim({ token: invite.token, memberId: placeholder.id }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('refuses to let an existing member join as a brand-new member', async () => {
    const { ownerCaller, group, invite } = await setupInvite();
    await expect(ownerCaller.invite.claim({ token: invite.token })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    const memberCount = await testPrisma.member.count({ where: { groupId: group.id } });
    expect(memberCount).toBe(2); // owner + placeholder, no duplicate
  });

  it('re-claiming the member you already hold is an idempotent no-op', async () => {
    const { ownerCaller, group, ownerMember, invite } = await setupInvite();
    const result = await ownerCaller.invite.claim({
      token: invite.token,
      memberId: ownerMember.id,
    });
    expect(result.id).toBe(ownerMember.id);

    // No second join: the usage counter and the activity log are untouched.
    const stored = await testPrisma.invite.findUniqueOrThrow({ where: { token: invite.token } });
    expect(stored.usedCount).toBe(0);
    const joins = await testPrisma.activityLog.count({
      where: { groupId: group.id, action: 'member.joined' },
    });
    expect(joins).toBe(0);
  });

  it('lets a removed member rejoin through a fresh link', async () => {
    const { invite, placeholder } = await setupInvite();
    const newcomer = await createTestUser('newcomer@example.com');
    const newcomerCaller = makeCaller(newcomer);
    await newcomerCaller.invite.claim({ token: invite.token, memberId: placeholder.id });

    // Removal deactivates rather than deletes (FR-2.4), so the guard must look
    // at active members only — otherwise a removed person could never come back.
    await testPrisma.member.update({
      where: { id: placeholder.id },
      data: { isActive: false },
    });

    const rejoined = await newcomerCaller.invite.claim({ token: invite.token });
    expect(rejoined.isActive).toBe(true);
    expect(rejoined.id).not.toBe(placeholder.id);
  });

  it('claimOptions reports an existing membership and hides the name list', async () => {
    const { ownerCaller, group, invite } = await setupInvite();
    const options = await ownerCaller.invite.claimOptions({ token: invite.token });
    expect(options.alreadyMember).toBe(true);
    expect(options.groupId).toBe(group.id);
    expect(options.members).toEqual([]);
  });

  it('claimOptions still lists names for a genuine newcomer', async () => {
    const { invite, placeholder } = await setupInvite();
    const newcomer = await createTestUser('fresh@example.com');
    const options = await makeCaller(newcomer).invite.claimOptions({ token: invite.token });
    expect(options.alreadyMember).toBe(false);
    expect(options.members.map((m) => m.id)).toContain(placeholder.id);
  });
});
