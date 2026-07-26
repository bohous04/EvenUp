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
    // An active member is not a "returning" one -- there's nothing to welcome
    // them back to, they're already there and get redirected instead.
    expect(options.returningMember).toBeNull();
  });

  it('claimOptions still lists names for a genuine newcomer', async () => {
    const { invite, placeholder } = await setupInvite();
    const newcomer = await createTestUser('fresh@example.com');
    const options = await makeCaller(newcomer).invite.claimOptions({ token: invite.token });
    expect(options.alreadyMember).toBe(false);
    expect(options.members.map((m) => m.id)).toContain(placeholder.id);
    // Never having had a row in this group at all is not "returning" either.
    expect(options.returningMember).toBeNull();
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

  it('claimOptions reports returningMember for a deactivated ex-member, naming their own row', async () => {
    const { invite, placeholder } = await setupInvite();
    const newcomer = await createTestUser('newcomer@example.com');
    const newcomerCaller = makeCaller(newcomer);
    await newcomerCaller.invite.claim({ token: invite.token, memberId: placeholder.id });
    await testPrisma.member.update({ where: { id: placeholder.id }, data: { isActive: false } });

    // The invite page's welcome-back view is built entirely from this field --
    // it must name the caller's OWN (inactive) row, not a stranger's, and must
    // not leak the picker's member list alongside it.
    const options = await newcomerCaller.invite.claimOptions({ token: invite.token });
    expect(options.returningMember).toEqual({ id: placeholder.id, displayName: 'Marek' });
    expect(options.members).toEqual([]);
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

  it('findOwnMembership prefers an active row when the caller holds a stray inactive duplicate', async () => {
    const { ownerCaller, group, invite } = await setupInvite();
    const dupUser = await createTestUser('dup@example.com');

    // Build the exact production state this guards against directly in the
    // DB: two rows for the same user in the same group (no unique index
    // stops this). Insert the INACTIVE row first so an unordered `findFirst`
    // -- the pre-fix behaviour -- would plausibly return it first.
    const inactive = await ownerCaller.member.add({ groupId: group.id, displayName: 'Dup Old' });
    await testPrisma.member.update({
      where: { id: inactive.id },
      data: { userId: dupUser.id, isActive: false },
    });
    const active = await ownerCaller.member.add({ groupId: group.id, displayName: 'Dup New' });
    await testPrisma.member.update({
      where: { id: active.id },
      data: { userId: dupUser.id, isActive: true },
    });

    // If the arbitrary (pre-fix) pick had landed on `inactive`, this claim
    // would have reactivated it, leaving dupUser with two active rows --
    // increasing the duplicate count instead of containing it.
    await expect(makeCaller(dupUser).invite.claim({ token: invite.token })).rejects.toMatchObject({
      code: 'CONFLICT',
    });

    const inactiveAfter = await testPrisma.member.findUniqueOrThrow({
      where: { id: inactive.id },
    });
    expect(inactiveAfter.isActive).toBe(false); // must not have been reactivated

    const activeCount = await testPrisma.member.count({
      where: { groupId: group.id, userId: dupUser.id, isActive: true },
    });
    expect(activeCount).toBe(1); // still exactly one active row for this user
  });
});

describe('member.remove no longer hard-deletes an account-linked member', () => {
  beforeEach(resetDb);

  it('refuses the remove-then-claim attack: a non-admin cannot dodge the guard by removing themselves first', async () => {
    const { placeholder, invite } = await setupInvite();

    // Attacker joins as a genuine, non-admin newcomer with no transactions --
    // exactly the state of anyone who has just joined.
    const attacker = await createTestUser('attacker2@example.com');
    const attackerCaller = makeCaller(attacker);
    const attackerMember = await attackerCaller.invite.claim({ token: invite.token });
    expect(attackerMember.role).toBe('MEMBER');

    // Before the member.ts fix, a member with no split/payer rows was HARD
    // DELETED here regardless of who removed them -- erasing the row
    // `findOwnMembership` needs to see. Worse than the deactivate-then-claim
    // variant: it destroys data and is repeatable (take over the next
    // member, remove it, repeat).
    await attackerCaller.member.remove({ memberId: attackerMember.id });

    await expect(
      attackerCaller.invite.claim({ token: invite.token, memberId: placeholder.id }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    // The victim's placeholder is untouched -- never hijacked.
    const stillUnclaimed = await testPrisma.member.findUniqueOrThrow({
      where: { id: placeholder.id },
    });
    expect(stillUnclaimed.userId).toBeNull();
  });

  it('deactivates an account-linked member with no transactions instead of deleting it', async () => {
    const { placeholder, invite } = await setupInvite();
    const newcomer = await createTestUser('linked@example.com');
    const newcomerCaller = makeCaller(newcomer);
    const member = await newcomerCaller.invite.claim({
      token: invite.token,
      memberId: placeholder.id,
    });

    const result = await newcomerCaller.member.remove({ memberId: member.id });
    expect(result).toMatchObject({ isActive: false });

    const stillThere = await testPrisma.member.findUnique({ where: { id: member.id } });
    expect(stillThere).not.toBeNull();
    expect(stillThere?.isActive).toBe(false);
    expect(stillThere?.userId).toBe(newcomer.id);
  });

  it('still hard-deletes an unlinked placeholder with no transactions (no regression)', async () => {
    const { ownerCaller, group } = await setupInvite();
    const spare = await ownerCaller.member.add({ groupId: group.id, displayName: 'Spare' });

    const result = await ownerCaller.member.remove({ memberId: spare.id });
    expect(result).toEqual({ deleted: true });

    const gone = await testPrisma.member.findUnique({ where: { id: spare.id } });
    expect(gone).toBeNull();
  });
});
