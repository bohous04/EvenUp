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
});

describe('user.setBankAccount / clearBankAccount / me', () => {
  beforeEach(resetDb);

  it('stores the account encrypted and me returns only the mask', async () => {
    const user = await createTestUser('acct@example.com');
    const caller = makeCaller(user);

    const res = await caller.user.setBankAccount({ account: ' 19 - 2000145399 / 0800 ' });
    expect(res).toEqual({ ok: true, masked: '…5399/0800' });

    const row = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.bankAccountEncrypted).not.toBeNull();
    expect(row.bankAccountEncrypted).not.toContain('2000145399'); // encrypted, not plaintext

    const me = await caller.user.me();
    expect(me.bankAccountMasked).toBe('…5399/0800');
    expect(JSON.stringify(me)).not.toContain('2000145399');
  });

  it('rejects an invalid account number', async () => {
    const user = await createTestUser('acct2@example.com');
    await expect(
      makeCaller(user).user.setBankAccount({ account: '1000145399/0800' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('clearBankAccount nulls the column and the mask', async () => {
    const user = await createTestUser('acct3@example.com');
    const caller = makeCaller(user);
    await caller.user.setBankAccount({ account: '19-2000145399/0800' });
    await caller.user.clearBankAccount();

    const row = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.bankAccountEncrypted).toBeNull();
    expect((await caller.user.me()).bankAccountMasked).toBeNull();
  });
});
