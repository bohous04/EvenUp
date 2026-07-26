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

  it('lets a removed member rejoin, reactivating their original row rather than creating a new one', async () => {
    const { invite, placeholder } = await setupInvite();
    const newcomer = await createTestUser('newcomer@example.com');
    const newcomerCaller = makeCaller(newcomer);
    await newcomerCaller.invite.claim({ token: invite.token, memberId: placeholder.id });

    // Removal deactivates rather than deletes (FR-2.4). The row must be
    // reactivated IN PLACE, not replaced with a fresh empty one -- otherwise
    // the returning member's history and debts strand on an orphan, which is
    // exactly the duplicate-member problem member.merge exists to clean up.
    await testPrisma.member.update({
      where: { id: placeholder.id },
      data: { isActive: false },
    });

    const rejoined = await newcomerCaller.invite.claim({ token: invite.token });
    expect(rejoined.id).toBe(placeholder.id);
    expect(rejoined.isActive).toBe(true);
  });

  it('refuses the deactivate-then-claim attack: a non-admin cannot dodge the guard by deactivating themselves first', async () => {
    const { placeholder, invite } = await setupInvite();

    // Attacker joins the group as a genuine, non-admin newcomer.
    const attacker = await createTestUser('attacker@example.com');
    const attackerCaller = makeCaller(attacker);
    const attackerMember = await attackerCaller.invite.claim({ token: invite.token });
    expect(attackerMember.role).toBe('MEMBER'); // non-admin: member.update's weak guard is the only door

    // `member.update`/`member.remove` deactivate a member behind nothing
    // stronger than group access -- ANY member, not just an admin, can
    // deactivate themselves. Before this fix that made findOwnMembership see
    // no membership at all, letting the attacker claim someone else's member
    // (and later reactivate themselves to hold two active rows).
    await attackerCaller.member.update({ memberId: attackerMember.id, isActive: false });

    await expect(
      attackerCaller.invite.claim({ token: invite.token, memberId: placeholder.id }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    // The victim's placeholder is untouched -- never hijacked.
    const stillUnclaimed = await testPrisma.member.findUniqueOrThrow({
      where: { id: placeholder.id },
    });
    expect(stillUnclaimed.userId).toBeNull();
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

  it('claimOptions does not report alreadyMember for a deactivated ex-member', async () => {
    const { invite, placeholder } = await setupInvite();
    const newcomer = await createTestUser('newcomer@example.com');
    const newcomerCaller = makeCaller(newcomer);
    await newcomerCaller.invite.claim({ token: invite.token, memberId: placeholder.id });
    await testPrisma.member.update({ where: { id: placeholder.id }, data: { isActive: false } });

    // A deactivated ex-member must reach the claim page, not get redirected
    // into the group -- otherwise they can never get back to the "not on the
    // list" path that reactivates their row.
    const options = await newcomerCaller.invite.claimOptions({ token: invite.token });
    expect(options.alreadyMember).toBe(false);
  });

  it('a genuine first-time join bumps usedCount and writes a member.joined activity entry', async () => {
    const { group, invite, placeholder } = await setupInvite();
    const newcomer = await createTestUser('newcomer@example.com');
    await makeCaller(newcomer).invite.claim({ token: invite.token, memberId: placeholder.id });

    // The positive half of the idempotency contract: a real join is NOT a
    // no-op. A regression that always took the no-op branch would keep every
    // other test in this file green, so this must be pinned on its own.
    const stored = await testPrisma.invite.findUniqueOrThrow({ where: { token: invite.token } });
    expect(stored.usedCount).toBe(1);
    const joins = await testPrisma.activityLog.count({
      where: { groupId: group.id, action: 'member.joined' },
    });
    expect(joins).toBe(1);
  });

  it('a retried claim of your own member still no-ops once the invite is exhausted', async () => {
    const { ownerCaller, group, ownerMember } = await setupInvite();
    const limitedInvite = await ownerCaller.invite.create({ groupId: group.id, maxUses: 1 });

    // Someone else spends the invite's single use.
    const newcomer = await createTestUser('newcomer@example.com');
    await makeCaller(newcomer).invite.claim({ token: limitedInvite.token });
    const exhausted = await testPrisma.invite.findUniqueOrThrow({
      where: { id: limitedInvite.id },
    });
    expect(exhausted.usedCount).toBe(1); // sanity: the invite really is exhausted now

    // The usage-limit check runs AFTER the own-membership check specifically
    // so this retry -- of a claim the owner already holds -- still no-ops
    // instead of failing with "usage limit reached".
    const result = await ownerCaller.invite.claim({
      token: limitedInvite.token,
      memberId: ownerMember.id,
    });
    expect(result.id).toBe(ownerMember.id);
  });
});
