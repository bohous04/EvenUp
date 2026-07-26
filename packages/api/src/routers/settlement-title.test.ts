/** A settlement stores no title of its own; the label is localized at render time. */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeCaller, createTestUser, testPrisma, resetDb } from '../test/harness.js';

async function setupGroupWithTwoMembers() {
  const user = await createTestUser('titles@example.com');
  const caller = makeCaller(user);
  const group = await caller.group.create({
    name: 'Tituly',
    template: 'TRIP',
    baseCurrency: 'CZK',
  });
  const payer = await testPrisma.member.findFirstOrThrow({
    where: { groupId: group.id, userId: user.id },
  });
  const payee = await caller.member.add({ groupId: group.id, displayName: 'Petr' });
  return { caller, group, payer, payee };
}

describe('settlement titles', () => {
  beforeEach(resetDb);

  it('stores an empty title when no note is given', async () => {
    const { caller, group, payer, payee } = await setupGroupWithTwoMembers();
    const tx = await caller.transaction.recordTransfer({
      groupId: group.id,
      fromMemberId: payer.id,
      toMemberId: payee.id,
      amountMinorUnits: 10_000,
      currency: 'CZK',
      method: 'CASH',
    });
    const stored = await testPrisma.transaction.findUniqueOrThrow({ where: { id: tx.id } });
    expect(stored.title).toBe('');
  });

  it('keeps a note the user actually typed', async () => {
    const { caller, group, payer, payee } = await setupGroupWithTwoMembers();
    const tx = await caller.transaction.recordTransfer({
      groupId: group.id,
      fromMemberId: payer.id,
      toMemberId: payee.id,
      amountMinorUnits: 10_000,
      currency: 'CZK',
      method: 'CASH',
      note: 'Za benzín',
    });
    const stored = await testPrisma.transaction.findUniqueOrThrow({ where: { id: tx.id } });
    expect(stored.title).toBe('Za benzín');
  });

  it('never writes the English word Settlement', async () => {
    const { caller, group, payer, payee } = await setupGroupWithTwoMembers();
    await caller.transaction.recordTransfer({
      groupId: group.id,
      fromMemberId: payer.id,
      toMemberId: payee.id,
      amountMinorUnits: 500,
      currency: 'CZK',
      method: 'QR',
    });
    const leaked = await testPrisma.transaction.count({ where: { title: 'Settlement' } });
    expect(leaked).toBe(0);
  });

  it('updateTransfer stores an empty title when no note is given', async () => {
    const { caller, group, payer, payee } = await setupGroupWithTwoMembers();
    const tx = await caller.transaction.recordTransfer({
      groupId: group.id,
      fromMemberId: payer.id,
      toMemberId: payee.id,
      amountMinorUnits: 10_000,
      currency: 'CZK',
      method: 'CASH',
      note: 'Za benzín',
    });
    await caller.transaction.updateTransfer({
      groupId: group.id,
      transactionId: tx.id,
      fromMemberId: payer.id,
      toMemberId: payee.id,
      amountMinorUnits: 10_000,
      currency: 'CZK',
      method: 'CASH',
    });
    const stored = await testPrisma.transaction.findUniqueOrThrow({ where: { id: tx.id } });
    expect(stored.title).toBe('');
  });

  it('updateTransfer keeps a note the user actually typed', async () => {
    const { caller, group, payer, payee } = await setupGroupWithTwoMembers();
    const tx = await caller.transaction.recordTransfer({
      groupId: group.id,
      fromMemberId: payer.id,
      toMemberId: payee.id,
      amountMinorUnits: 10_000,
      currency: 'CZK',
      method: 'CASH',
    });
    await caller.transaction.updateTransfer({
      groupId: group.id,
      transactionId: tx.id,
      fromMemberId: payer.id,
      toMemberId: payee.id,
      amountMinorUnits: 10_000,
      currency: 'CZK',
      method: 'CASH',
      note: 'Za benzín',
    });
    const stored = await testPrisma.transaction.findUniqueOrThrow({ where: { id: tx.id } });
    expect(stored.title).toBe('Za benzín');
  });
});
