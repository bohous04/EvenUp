/**
 * Editing existing transactions in place (transaction.updateExpense /
 * updateTransfer): recomputes splits, FX and balances, and enforces that each
 * mutation only touches its own transaction kind.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeCaller, createTestUser, resetDb, testPrisma } from '../test/harness.js';

beforeAll(async () => {
  await testPrisma.$queryRaw`SELECT 1`;
});
beforeEach(async () => {
  await resetDb();
});

async function seedGroup() {
  const olivia = await createTestUser('olivia@example.com');
  const caller = makeCaller(olivia);
  const group = await caller.group.create({
    name: 'Tatry 2026',
    template: 'TRIP',
    baseCurrency: 'CZK',
  });
  const oliviaM = group.members[0]!;
  const petr = await caller.member.add({ groupId: group.id, displayName: 'Petr' });
  const jana = await caller.member.add({ groupId: group.id, displayName: 'Jana' });
  return { olivia, caller, group, m: { olivia: oliviaM, petr, jana } };
}

function equalExpense(groupId: string, payerId: string, memberIds: string[], amount: number) {
  return {
    groupId,
    title: 'Chata',
    currency: 'CZK',
    date: new Date('2026-06-22'),
    payers: [{ memberId: payerId, amountMinorUnits: amount }],
    split: { type: 'EQUAL' as const, members: memberIds.map((id) => ({ memberId: id })) },
  };
}

describe('transaction.updateExpense', () => {
  it('edits amount/title and recomputes balances', async () => {
    const { caller, group, m } = await seedGroup();
    const tx = await caller.transaction.createExpense(
      equalExpense(group.id, m.olivia.id, [m.olivia.id, m.petr.id, m.jana.id], 90000),
    );

    const updated = await caller.transaction.updateExpense({
      transactionId: tx.id,
      ...equalExpense(group.id, m.olivia.id, [m.olivia.id, m.petr.id, m.jana.id], 60000),
      title: 'Chata (upraveno)',
    });
    expect(updated.id).toBe(tx.id);
    expect(updated.title).toBe('Chata (upraveno)');

    const list = await caller.transaction.list({ groupId: group.id });
    expect(list).toHaveLength(1); // edited in place, not duplicated
    expect(Number(list[0]!.totalMinorUnits)).toBe(60000);

    const { balances } = await caller.balance.get({ groupId: group.id });
    const byName = Object.fromEntries(balances.map((b) => [b.displayName, b.balanceMinorUnits]));
    expect(byName['olivia']).toBe(40000); // paid 600, owes 200
    expect(byName['Petr']).toBe(-20000);
    expect(byName['Jana']).toBe(-20000);
  });

  it('recomputes splits when the membership changes', async () => {
    const { caller, group, m } = await seedGroup();
    const tx = await caller.transaction.createExpense(
      equalExpense(group.id, m.olivia.id, [m.olivia.id, m.petr.id, m.jana.id], 90000),
    );

    // Now split the same 900 between only Olivia and Petr.
    await caller.transaction.updateExpense({
      transactionId: tx.id,
      ...equalExpense(group.id, m.olivia.id, [m.olivia.id, m.petr.id], 90000),
    });

    const { balances } = await caller.balance.get({ groupId: group.id });
    const byName = Object.fromEntries(balances.map((b) => [b.displayName, b.balanceMinorUnits]));
    expect(byName['olivia']).toBe(45000); // paid 900, owes 450
    expect(byName['Petr']).toBe(-45000);
    expect(byName['Jana'] ?? 0).toBe(0); // no longer involved
  });

  it('refuses to edit a settlement as an expense', async () => {
    const { caller, group, m } = await seedGroup();
    const transfer = await caller.transaction.recordTransfer({
      groupId: group.id,
      fromMemberId: m.petr.id,
      toMemberId: m.olivia.id,
      amountMinorUnits: 10000,
      currency: 'CZK',
      method: 'CASH',
    });
    await expect(
      caller.transaction.updateExpense({
        transactionId: transfer.id,
        ...equalExpense(group.id, m.olivia.id, [m.olivia.id, m.petr.id], 10000),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('denies a stranger who is not in the group', async () => {
    const { caller, group, m } = await seedGroup();
    const tx = await caller.transaction.createExpense(
      equalExpense(group.id, m.olivia.id, [m.olivia.id, m.petr.id], 5000),
    );
    const stranger = makeCaller(await createTestUser('stranger@example.com'));
    await expect(
      stranger.transaction.updateExpense({
        transactionId: tx.id,
        ...equalExpense(group.id, m.olivia.id, [m.olivia.id, m.petr.id], 9999),
      }),
    ).rejects.toBeTruthy();
  });
});

describe('split fidelity (raw input persisted for faithful edits)', () => {
  it('persists SHARES weights and restores them on read + edit', async () => {
    const { caller, group, m } = await seedGroup();
    const tx = await caller.transaction.createExpense({
      groupId: group.id,
      title: 'Shares',
      currency: 'CZK',
      date: new Date('2026-06-22'),
      payers: [{ memberId: m.olivia.id, amountMinorUnits: 90000 }],
      split: {
        type: 'SHARES',
        members: [
          { memberId: m.olivia.id, weight: 2 },
          { memberId: m.petr.id, weight: 1 },
        ],
      },
    });

    const list = await caller.transaction.list({ groupId: group.id });
    expect(list[0]!.splitType).toBe('SHARES');
    const weights = Object.fromEntries(list[0]!.splits.map((s) => [s.memberId, s.shareWeight]));
    expect(weights[m.olivia.id]).toBe(2);
    expect(weights[m.petr.id]).toBe(1);
    const computed = Object.fromEntries(
      list[0]!.splits.map((s) => [s.memberId, Number(s.computedMinorUnits)]),
    );
    expect(computed[m.olivia.id]).toBe(60000); // 900 × 2/3
    expect(computed[m.petr.id]).toBe(30000); // 900 × 1/3

    // Edit the weights to 1:1 → the stored weights and computed shares both update.
    await caller.transaction.updateExpense({
      transactionId: tx.id,
      groupId: group.id,
      title: 'Shares',
      currency: 'CZK',
      date: new Date('2026-06-22'),
      payers: [{ memberId: m.olivia.id, amountMinorUnits: 90000 }],
      split: {
        type: 'SHARES',
        members: [
          { memberId: m.olivia.id, weight: 1 },
          { memberId: m.petr.id, weight: 1 },
        ],
      },
    });
    const after = await caller.transaction.list({ groupId: group.id });
    const w2 = Object.fromEntries(after[0]!.splits.map((s) => [s.memberId, s.shareWeight]));
    expect(w2[m.olivia.id]).toBe(1);
    expect(w2[m.petr.id]).toBe(1);
    expect(Number(after[0]!.splits.find((s) => s.memberId === m.petr.id)!.computedMinorUnits)).toBe(
      45000,
    );
  });

  it('persists PERCENTAGE splits and returns percentage as a plain number', async () => {
    const { caller, group, m } = await seedGroup();
    await caller.transaction.createExpense({
      groupId: group.id,
      title: 'Pct',
      currency: 'CZK',
      date: new Date('2026-06-22'),
      payers: [{ memberId: m.olivia.id, amountMinorUnits: 10000 }],
      split: {
        type: 'PERCENTAGE',
        members: [
          { memberId: m.olivia.id, percentage: 25 },
          { memberId: m.petr.id, percentage: 75 },
        ],
      },
    });

    const list = await caller.transaction.list({ groupId: group.id });
    expect(list[0]!.splitType).toBe('PERCENTAGE');
    const pct = Object.fromEntries(list[0]!.splits.map((s) => [s.memberId, s.percentage]));
    expect(pct[m.olivia.id]).toBe(25);
    expect(pct[m.petr.id]).toBe(75);
    expect(typeof pct[m.olivia.id]).toBe('number'); // a number, not a Prisma Decimal
  });
});

describe('transaction.updateTransfer', () => {
  it('edits a settlement amount and recomputes balances', async () => {
    const { caller, group, m } = await seedGroup();
    const transfer = await caller.transaction.recordTransfer({
      groupId: group.id,
      fromMemberId: m.petr.id,
      toMemberId: m.olivia.id,
      amountMinorUnits: 10000,
      currency: 'CZK',
      method: 'CASH',
    });

    const updated = await caller.transaction.updateTransfer({
      transactionId: transfer.id,
      groupId: group.id,
      fromMemberId: m.petr.id,
      toMemberId: m.olivia.id,
      amountMinorUnits: 25000,
      currency: 'CZK',
      method: 'QR',
    });
    expect(updated.id).toBe(transfer.id);

    const list = await caller.transaction.list({ groupId: group.id });
    expect(list).toHaveLength(1);
    expect(Number(list[0]!.totalMinorUnits)).toBe(25000);
    expect(list[0]!.method).toBe('QR');
  });

  it('refuses to edit an expense as a settlement', async () => {
    const { caller, group, m } = await seedGroup();
    const tx = await caller.transaction.createExpense(
      equalExpense(group.id, m.olivia.id, [m.olivia.id, m.petr.id], 10000),
    );
    await expect(
      caller.transaction.updateTransfer({
        transactionId: tx.id,
        groupId: group.id,
        fromMemberId: m.petr.id,
        toMemberId: m.olivia.id,
        amountMinorUnits: 5000,
        currency: 'CZK',
        method: 'CASH',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('member isolation (no cross-group member references)', () => {
  it('rejects create/update expense and transfer that reference a foreign member', async () => {
    const { caller, group, m } = await seedGroup();
    // A second group (same owner) whose member id must never be usable in group A.
    const other = await caller.group.create({
      name: 'Other',
      template: 'OTHER',
      baseCurrency: 'CZK',
    });
    const foreign = other.members[0]!.id;

    // Create: a split beneficiary from another group.
    await expect(
      caller.transaction.createExpense(
        equalExpense(group.id, m.olivia.id, [m.olivia.id, foreign], 1000),
      ),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    // Update: swap a valid split member for a foreign one.
    const tx = await caller.transaction.createExpense(
      equalExpense(group.id, m.olivia.id, [m.olivia.id, m.petr.id], 1000),
    );
    await expect(
      caller.transaction.updateExpense({
        transactionId: tx.id,
        ...equalExpense(group.id, m.olivia.id, [m.olivia.id, foreign], 1000),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    // Transfer: a foreign endpoint.
    await expect(
      caller.transaction.recordTransfer({
        groupId: group.id,
        fromMemberId: m.petr.id,
        toMemberId: foreign,
        amountMinorUnits: 500,
        currency: 'CZK',
        method: 'CASH',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
