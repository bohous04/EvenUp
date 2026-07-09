/** generateSpayd payee resolution: user-level account → legacy member IBAN → fail. */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeCaller, createTestUser, testPrisma, testSecretBox, resetDb } from '../test/harness.js';

async function setupGroup(creatorEmail: string) {
  const user = await createTestUser(creatorEmail);
  const caller = makeCaller(user);
  const group = await caller.group.create({ name: 'QR', template: 'TRIP', baseCurrency: 'CZK' });
  const creatorMember = await testPrisma.member.findFirstOrThrow({
    where: { groupId: group.id, userId: user.id },
  });
  return { user, caller, group, creatorMember };
}

describe('settlement.generateSpayd resolution', () => {
  beforeEach(resetDb);

  it('uses the linked user account (converted to IBAN, RN = user name)', async () => {
    const { caller, group, creatorMember } = await setupGroup('payee@example.com');
    await caller.user.updateProfile({ name: 'Michal Novák' });
    await caller.user.setBankAccount({ account: '19-2000145399/0800' });

    const { spayd } = await caller.settlement.generateSpayd({
      groupId: group.id,
      toMemberId: creatorMember.id,
      amountMinorUnits: 12345,
      currency: 'CZK',
    });
    expect(spayd).toContain('ACC:CZ6508000000192000145399');
    expect(spayd).toContain('RN:');
  });

  it('user-level account beats a legacy member bankDetail', async () => {
    const { caller, group, creatorMember } = await setupGroup('payee2@example.com');
    await testPrisma.bankDetail.create({
      data: {
        memberId: creatorMember.id,
        ibanEncrypted: testSecretBox.encrypt('CZ9455000000001011038930'),
      },
    });
    await caller.user.setBankAccount({ account: '19-2000145399/0800' });

    const { spayd } = await caller.settlement.generateSpayd({
      groupId: group.id,
      toMemberId: creatorMember.id,
      amountMinorUnits: 100,
      currency: 'CZK',
    });
    expect(spayd).toContain('ACC:CZ6508000000192000145399');
  });

  it('falls back to the legacy member bankDetail when the user has no account', async () => {
    const { caller, group, creatorMember } = await setupGroup('payee3@example.com');
    await testPrisma.bankDetail.create({
      data: {
        memberId: creatorMember.id,
        ibanEncrypted: testSecretBox.encrypt('CZ9455000000001011038930'),
      },
    });

    const { spayd } = await caller.settlement.generateSpayd({
      groupId: group.id,
      toMemberId: creatorMember.id,
      amountMinorUnits: 100,
      currency: 'CZK',
    });
    expect(spayd).toContain('ACC:CZ9455000000001011038930');
  });

  it('fails with PRECONDITION_FAILED when neither exists (virtual member)', async () => {
    const { caller, group } = await setupGroup('payee4@example.com');
    const virtual = await caller.member.add({ groupId: group.id, displayName: 'Petr' });

    await expect(
      caller.settlement.generateSpayd({
        groupId: group.id,
        toMemberId: virtual.id,
        amountMinorUnits: 100,
        currency: 'CZK',
      }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
});
