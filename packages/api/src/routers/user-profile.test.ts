/** User profile: nickname propagation + CZ bank account (spec 2026-07-09). */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeCaller, createTestUser, testPrisma, resetDb } from '../test/harness.js';
import type { AuthUser } from '../context.js';

/** Create a group as `user` and return their auto-created linked member. */
async function createGroupWithLinkedMember(user: AuthUser, name: string) {
  const caller = makeCaller(user);
  const group = await caller.group.create({ name, template: 'TRIP', baseCurrency: 'CZK' });
  const member = await testPrisma.member.findFirstOrThrow({
    where: { groupId: group.id, userId: user.id },
  });
  return { group, member };
}

describe('user.updateProfile', () => {
  beforeEach(resetDb);

  it('renames the user and every linked member, re-deriving initials', async () => {
    const user = await createTestUser('nick@example.com');
    const a = await createGroupWithLinkedMember(user, 'Trip A');
    const b = await createGroupWithLinkedMember(user, 'Trip B');

    const res = await makeCaller(user).user.updateProfile({ name: 'Michal Novák' });
    expect(res).toMatchObject({ ok: true, membersRenamed: 2 });

    const updatedUser = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updatedUser.name).toBe('Michal Novák');

    for (const m of [a.member, b.member]) {
      const updated = await testPrisma.member.findUniqueOrThrow({ where: { id: m.id } });
      expect(updated.displayName).toBe('Michal Novák');
      expect(updated.initials).toBe('MN');
    }
  });

  it('does not touch unlinked members and logs member.updated per group', async () => {
    const user = await createTestUser('nick2@example.com');
    const { group } = await createGroupWithLinkedMember(user, 'Trip');
    const virtual = await makeCaller(user).member.add({ groupId: group.id, displayName: 'Petr' });

    await makeCaller(user).user.updateProfile({ name: 'Nové Jméno' });

    const untouched = await testPrisma.member.findUniqueOrThrow({ where: { id: virtual.id } });
    expect(untouched.displayName).toBe('Petr');

    const activities = await testPrisma.activityLog.findMany({
      where: { groupId: group.id, action: 'member.updated' },
    });
    expect(activities).toHaveLength(1);
  });

  it('rejects an empty name', async () => {
    const user = await createTestUser('nick3@example.com');
    await expect(makeCaller(user).user.updateProfile({ name: '   ' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('renames active memberships but leaves a deactivated row (removed group) untouched, and logs no activity there', async () => {
    const user = await createTestUser('ghost@example.com');
    const userCaller = makeCaller(user);

    // Group A: still an active member (the auto-created member from group.create).
    const groupA = await userCaller.group.create({
      name: 'Active Trip',
      template: 'TRIP',
      baseCurrency: 'CZK',
    });
    const memberA = await testPrisma.member.findFirstOrThrow({
      where: { groupId: groupA.id, userId: user.id },
    });

    // Group B: joined via invite, then removed by the owner -> deactivated row.
    const owner = await createTestUser('ghost-owner@example.com');
    const ownerCaller = makeCaller(owner);
    const groupB = await ownerCaller.group.create({
      name: 'Old Trip',
      template: 'TRIP',
      baseCurrency: 'CZK',
    });
    const invite = await ownerCaller.invite.create({ groupId: groupB.id });
    const memberB = await userCaller.invite.claim({ token: invite.token });
    await ownerCaller.member.remove({ memberId: memberB.id });

    const res = await userCaller.user.updateProfile({ name: 'Ghost Name' });
    // Only the one active membership (group A) counts -- the deactivated row
    // in group B isn't "renamed".
    expect(res).toMatchObject({ ok: true, membersRenamed: 1 });

    const updatedA = await testPrisma.member.findUniqueOrThrow({ where: { id: memberA.id } });
    expect(updatedA.displayName).toBe('Ghost Name');

    const untouchedB = await testPrisma.member.findUniqueOrThrow({ where: { id: memberB.id } });
    expect(untouchedB.displayName).not.toBe('Ghost Name');
    expect(untouchedB.isActive).toBe(false);

    const activityInB = await testPrisma.activityLog.findMany({
      where: { groupId: groupB.id, action: 'member.updated' },
    });
    expect(activityInB).toHaveLength(0);
  });
});

describe('user.setBankAccount / clearBankAccount / me', () => {
  beforeEach(resetDb);

  it('stores the account encrypted at rest; me only flags it, getBankAccount returns it in full', async () => {
    const user = await createTestUser('acct@example.com');
    const caller = makeCaller(user);

    const res = await caller.user.setBankAccount({ account: ' 19 - 2000145399 / 0800 ' });
    expect(res).toEqual({ ok: true, masked: '…5399/0800' });

    const row = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.bankAccountEncrypted).not.toBeNull();
    expect(row.bankAccountEncrypted).not.toContain('2000145399'); // encrypted, not plaintext

    // `me` never carries the plaintext — only a boolean flag.
    const me = await caller.user.me();
    expect(me.hasBankAccount).toBe(true);
    expect(JSON.stringify(me)).not.toContain('2000145399');

    // The owner sees the whole (normalized) account number via the dedicated query.
    expect(await caller.user.getBankAccount()).toEqual({ account: '19-2000145399/0800' });
  });

  it('rejects an invalid account number', async () => {
    const user = await createTestUser('acct2@example.com');
    await expect(
      makeCaller(user).user.setBankAccount({ account: '1000145399/0800' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('clearBankAccount nulls the column, the flag, and the value', async () => {
    const user = await createTestUser('acct3@example.com');
    const caller = makeCaller(user);
    await caller.user.setBankAccount({ account: '19-2000145399/0800' });
    await caller.user.clearBankAccount();

    const row = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.bankAccountEncrypted).toBeNull();
    expect((await caller.user.me()).hasBankAccount).toBe(false);
    expect(await caller.user.getBankAccount()).toEqual({ account: null });
  });

  it('getBankAccount fails closed (null) when the ciphertext is corrupt, without throwing', async () => {
    const user = await createTestUser('acct4@example.com');
    const caller = makeCaller(user);
    await caller.user.setBankAccount({ account: '19-2000145399/0800' });

    await testPrisma.user.update({
      where: { id: user.id },
      data: { bankAccountEncrypted: 'not-encrypted' },
    });

    // The flag still reports "set", but the value can't be decrypted → null, no throw.
    expect((await caller.user.me()).hasBankAccount).toBe(true);
    expect(await caller.user.getBankAccount()).toEqual({ account: null });
  });
});

describe('user.exportData', () => {
  beforeEach(resetDb);

  it('includes the decrypted bank account and never the encrypted column', async () => {
    const user = await createTestUser('export@example.com');
    const caller = makeCaller(user);
    await caller.user.setBankAccount({ account: '19-2000145399/0800' });

    const exported = await caller.user.exportData();
    expect(exported.profile.bankAccount).toBe('19-2000145399/0800');
    expect(JSON.stringify(exported)).not.toContain('bankAccountEncrypted');
  });

  it('returns the whole group, unchanged, for an active member', async () => {
    const owner = await createTestUser('exp-owner@example.com');
    const ownerCaller = makeCaller(owner);
    const group = await ownerCaller.group.create({
      name: 'Chata',
      template: 'TRIP',
      baseCurrency: 'CZK',
    });
    const invite = await ownerCaller.invite.create({ groupId: group.id });

    const member = await createTestUser('exp-active@example.com');
    const memberCaller = makeCaller(member);
    const memberRow = await memberCaller.invite.claim({ token: invite.token });
    const ownerMember = await testPrisma.member.findFirstOrThrow({
      where: { groupId: group.id, userId: owner.id },
    });

    await ownerCaller.transaction.createExpense({
      groupId: group.id,
      title: 'Shared dinner',
      currency: 'CZK',
      date: new Date('2026-07-01'),
      payers: [{ memberId: ownerMember.id, amountMinorUnits: 100000 }],
      split: {
        type: 'EQUAL',
        members: [{ memberId: ownerMember.id }, { memberId: memberRow.id }],
      },
    });

    const exported = await memberCaller.user.exportData();
    expect(exported.groups).toHaveLength(1);
    const exportedGroup = exported.groups[0]!;
    expect(exportedGroup.id).toBe(group.id);
    expect(exportedGroup.transactions.map((t) => t.title)).toEqual(['Shared dinner']);
    expect(exportedGroup.members.map((m) => m.id).sort()).toEqual(
      [ownerMember.id, memberRow.id].sort(),
    );
  });

  it('a removed member sees only the group identity and their own participation, nothing added after removal', async () => {
    const owner = await createTestUser('exp-owner2@example.com');
    const ownerCaller = makeCaller(owner);
    const group = await ownerCaller.group.create({
      name: 'Chata',
      template: 'TRIP',
      baseCurrency: 'CZK',
    });
    const invite = await ownerCaller.invite.create({ groupId: group.id });

    const removed = await createTestUser('exp-removed@example.com');
    const removedCaller = makeCaller(removed);
    const removedMember = await removedCaller.invite.claim({ token: invite.token });
    const ownerMember = await testPrisma.member.findFirstOrThrow({
      where: { groupId: group.id, userId: owner.id },
    });

    // Before removal: a transaction the removed member actually took part in.
    await ownerCaller.transaction.createExpense({
      groupId: group.id,
      title: 'Before removal dinner',
      currency: 'CZK',
      date: new Date('2026-07-01'),
      payers: [{ memberId: ownerMember.id, amountMinorUnits: 60000 }],
      split: {
        type: 'EQUAL',
        members: [{ memberId: ownerMember.id }, { memberId: removedMember.id }],
      },
    });

    await ownerCaller.member.remove({ memberId: removedMember.id });

    // After removal: a new member and a transaction that doesn't involve the removed member.
    const newPerson = await ownerCaller.member.add({ groupId: group.id, displayName: 'NewPerson' });
    await ownerCaller.transaction.createExpense({
      groupId: group.id,
      title: 'AFTER-removal-SECRET',
      currency: 'CZK',
      date: new Date('2026-07-15'),
      payers: [{ memberId: ownerMember.id, amountMinorUnits: 40000 }],
      split: {
        type: 'EQUAL',
        members: [{ memberId: ownerMember.id }, { memberId: newPerson.id }],
      },
    });

    const exported = await removedCaller.user.exportData();
    expect(exported.groups).toHaveLength(1);
    const exportedGroup = exported.groups[0]!;
    expect(exportedGroup.id).toBe(group.id);

    const titles = exportedGroup.transactions.map((t) => t.title);
    expect(titles).toContain('Before removal dinner');
    expect(titles).not.toContain('AFTER-removal-SECRET');

    const memberIds = exportedGroup.members.map((m) => m.id);
    expect(memberIds).toContain(removedMember.id);
    expect(memberIds).toContain(ownerMember.id); // co-participant of the shared transaction
    expect(memberIds).not.toContain(newPerson.id);
  });
});
