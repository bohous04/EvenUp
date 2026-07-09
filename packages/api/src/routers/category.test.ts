/** Category router: per-group custom category CRUD + guards (spec 2026-07-09). */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeCaller, createTestUser, testPrisma, resetDb } from '../test/harness.js';

async function groupFor(email: string) {
  const user = await createTestUser(email);
  const caller = makeCaller(user);
  const group = await caller.group.create({ name: 'Kat', template: 'TRIP', baseCurrency: 'CZK' });
  const member = await testPrisma.member.findFirstOrThrow({
    where: { groupId: group.id, userId: user.id },
  });
  return { user, caller, group, member };
}

describe('category router', () => {
  beforeEach(resetDb);

  it('creates, lists, updates; rejects duplicates and unknown icons', async () => {
    const { caller, group } = await groupFor('cat1@example.com');
    const created = await caller.category.create({
      groupId: group.id,
      name: 'Pivo',
      iconName: 'beer',
    });
    expect(created).toMatchObject({ name: 'Pivo', iconName: 'beer' });

    await expect(
      caller.category.create({ groupId: group.id, name: 'Pivo', iconName: 'coffee' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      caller.category.create({ groupId: group.id, name: 'X', iconName: 'not-an-icon' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    await caller.category.update({ categoryId: created.id, name: 'Pivko' });
    const listed = await caller.category.list({ groupId: group.id });
    expect(listed.find((c) => c.id === created.id)).toMatchObject({ name: 'Pivko' });
  });

  it('non-members cannot touch a group category', async () => {
    const { caller, group } = await groupFor('cat2@example.com');
    const created = await caller.category.create({
      groupId: group.id,
      name: 'Pivo',
      iconName: 'beer',
    });
    const stranger = makeCaller(await createTestUser('stranger@example.com'));
    await expect(stranger.category.list({ groupId: group.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(stranger.category.remove({ categoryId: created.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('remove reassigns the category expenses to other in one transaction', async () => {
    const { caller, group, member } = await groupFor('cat3@example.com');
    const cat = await caller.category.create({
      groupId: group.id,
      name: 'Pivo',
      iconName: 'beer',
    });
    await caller.transaction.createExpense({
      groupId: group.id,
      title: 'Bečka',
      currency: 'CZK',
      category: `custom:${cat.id}`,
      date: new Date(),
      payers: [{ memberId: member.id, amountMinorUnits: 1000 }],
      split: { type: 'EQUAL', members: [{ memberId: member.id }] },
    });
    await caller.category.remove({ categoryId: cat.id });
    const tx = await testPrisma.transaction.findFirstOrThrow({ where: { groupId: group.id } });
    expect(tx.category).toBe('other');
    const remaining = await caller.category.list({ groupId: group.id });
    expect(remaining.some((c) => c.id === cat.id)).toBe(false);
  });

  it('update rejects duplicate name with CONFLICT', async () => {
    const { caller, group } = await groupFor('cat-update-dup@example.com');
    await caller.category.create({
      groupId: group.id,
      name: 'Pivo',
      iconName: 'beer',
    });
    const catB = await caller.category.create({
      groupId: group.id,
      name: 'Kava',
      iconName: 'coffee',
    });
    await expect(
      caller.category.update({ categoryId: catB.id, name: 'Pivo' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('createExpense rejects a custom key from another group; stats keep live customs', async () => {
    const a = await groupFor('cat4@example.com');
    const b = await groupFor('cat5@example.com');
    const foreign = await b.caller.category.create({
      groupId: b.group.id,
      name: 'Cizí',
      iconName: 'gift',
    });
    await expect(
      a.caller.transaction.createExpense({
        groupId: a.group.id,
        title: 'X',
        currency: 'CZK',
        category: `custom:${foreign.id}`,
        date: new Date(),
        payers: [{ memberId: a.member.id, amountMinorUnits: 100 }],
        split: { type: 'EQUAL', members: [{ memberId: a.member.id }] },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    const mine = await a.caller.category.create({
      groupId: a.group.id,
      name: 'Moje',
      iconName: 'coffee',
    });
    await a.caller.transaction.createExpense({
      groupId: a.group.id,
      title: 'Y',
      currency: 'CZK',
      category: `custom:${mine.id}`,
      date: new Date(),
      payers: [{ memberId: a.member.id, amountMinorUnits: 300 }],
      split: { type: 'EQUAL', members: [{ memberId: a.member.id }] },
    });
    const stats = await a.caller.stats.byCategory({ groupId: a.group.id });
    expect(stats.find((s) => s.category === `custom:${mine.id}`)?.totalMinorUnits).toBe(300);
  });
});
