/** Cross-group activity feed backing mobile's Activity tab (PRD §4.9, FR-9.1/9.2). */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeCaller, createTestUser, testPrisma, resetDb } from '../test/harness.js';

async function seed() {
  const owner = await createTestUser('feed-owner@example.com');
  const caller = makeCaller(owner);
  const chata = await caller.group.create({
    name: 'Chata',
    template: 'TRIP',
    baseCurrency: 'CZK',
  });
  const byt = await caller.group.create({
    name: 'Byt',
    template: 'HOUSEHOLD',
    baseCurrency: 'EUR',
  });
  return { owner, caller, chata, byt };
}

/** `group.create` already logs `group.created`; add rows with a known order. */
async function log(groupId: string, actorId: string | null, action: string, payload: object) {
  return testPrisma.activityLog.create({ data: { groupId, actorId, action, payload } });
}

describe('activity.feed', () => {
  beforeEach(resetDb);

  it('returns rows from every group the user can see, newest first', async () => {
    const { owner, caller, chata, byt } = await seed();
    await log(chata.id, owner.id, 'expense.created', { title: 'Pizza' });
    await log(byt.id, owner.id, 'expense.created', { title: 'Nájem' });

    const res = await caller.activity.feed({});

    // Both groups present, and the two seeded rows lead (newest first).
    expect(res.items.slice(0, 2).map((i) => i.groupName)).toEqual(['Byt', 'Chata']);
    expect(res.items.some((i) => i.groupId === chata.id)).toBe(true);
    expect(res.items.some((i) => i.groupId === byt.id)).toBe(true);
  });

  it('carries each row its own group name and base currency', async () => {
    const { owner, caller, chata, byt } = await seed();
    await log(chata.id, owner.id, 'settlement.recorded', { amount: 10000 });
    await log(byt.id, owner.id, 'settlement.recorded', { amount: 5000 });

    const res = await caller.activity.feed({ action: 'settlement.recorded' });

    expect(res.items).toHaveLength(2);
    expect(res.items.find((i) => i.groupId === chata.id)).toMatchObject({
      groupName: 'Chata',
      baseCurrency: 'CZK',
    });
    expect(res.items.find((i) => i.groupId === byt.id)).toMatchObject({
      groupName: 'Byt',
      baseCurrency: 'EUR',
    });
  });

  it('resolves the actor to their member name in the row’s own group', async () => {
    const { owner, caller, chata, byt } = await seed();
    // The same user is a differently-named member in each group.
    await testPrisma.member.updateMany({
      where: { groupId: chata.id, userId: owner.id },
      data: { displayName: 'Chatař' },
    });
    await testPrisma.member.updateMany({
      where: { groupId: byt.id, userId: owner.id },
      data: { displayName: 'Spolubydlící' },
    });
    await log(chata.id, owner.id, 'expense.created', { title: 'Pizza' });
    await log(byt.id, owner.id, 'expense.created', { title: 'Nájem' });

    const res = await caller.activity.feed({ action: 'expense.created' });

    expect(res.items.find((i) => i.groupId === chata.id)?.actorName).toBe('Chatař');
    expect(res.items.find((i) => i.groupId === byt.id)?.actorName).toBe('Spolubydlící');
  });

  it('filters to one group and to one action', async () => {
    const { owner, caller, chata, byt } = await seed();
    await log(chata.id, owner.id, 'expense.created', { title: 'Pizza' });
    await log(byt.id, owner.id, 'expense.created', { title: 'Nájem' });

    const byGroup = await caller.activity.feed({ groupId: chata.id });
    expect(byGroup.items.every((i) => i.groupId === chata.id)).toBe(true);

    const byAction = await caller.activity.feed({ action: 'expense.created' });
    expect(byAction.items.map((i) => i.action)).toEqual(['expense.created', 'expense.created']);
  });

  it('never leaks a group the user is not in', async () => {
    const { owner, chata } = await seed();
    await log(chata.id, owner.id, 'expense.created', { title: 'Pizza' });

    const stranger = await createTestUser('feed-stranger@example.com');
    const strangerCaller = makeCaller(stranger);

    expect((await strangerCaller.activity.feed({})).items).toEqual([]);
    await expect(strangerCaller.activity.feed({ groupId: chata.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('pages with a cursor without repeating or dropping a row', async () => {
    const { owner, caller, chata } = await seed();
    for (let i = 0; i < 5; i++) {
      await log(chata.id, owner.id, 'expense.created', { title: `E${i}` });
    }

    const first = await caller.activity.feed({ action: 'expense.created', limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();

    const second = await caller.activity.feed({
      action: 'expense.created',
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(second.items).toHaveLength(2);

    const ids = [...first.items, ...second.items].map((i) => i.id);
    expect(new Set(ids).size).toBe(4);

    const all = await caller.activity.feed({ action: 'expense.created', limit: 100 });
    expect(all.items.map((i) => i.id).slice(0, 4)).toEqual(ids);
    expect(all.nextCursor).toBeNull();
  });

  it('returns an empty feed for a user with no groups', async () => {
    const lonely = await createTestUser('feed-lonely@example.com');
    const res = await makeCaller(lonely).activity.feed({});
    expect(res).toEqual({ items: [], nextCursor: null });
  });

  it('emits only the payload fields a client renders, dropping anything else', async () => {
    const { owner, caller, chata } = await seed();
    await log(chata.id, owner.id, 'expense.created', {
      title: 'Pizza',
      // A future call site logging any of these must not leak them to the group.
      email: 'leak@example.com',
      receiptUrl: 'https://private/receipt.png',
      internalNote: 'secret',
    });

    const items = (await caller.activity.feed({ action: 'expense.created' })).items;

    expect(items).toHaveLength(1);
    expect(items[0]?.payload).toEqual({ title: 'Pizza' });
  });

  it('applies the same payload allow-list to the per-group list', async () => {
    const { owner, caller, chata } = await seed();
    await log(chata.id, owner.id, 'expense.created', { title: 'Pizza', email: 'leak@example.com' });

    const items = (await caller.activity.list({ groupId: chata.id, action: 'expense.created' }))
      .items;

    expect(items).toHaveLength(1);
    expect(items[0]?.payload).toEqual({ title: 'Pizza' });
  });

  it('keeps every field the renderer needs, including a zero amount', async () => {
    const { owner, caller, chata } = await seed();
    await log(chata.id, owner.id, 'settlement.recorded', { amount: 0, method: 'CASH' });
    await log(chata.id, owner.id, 'expenses.imported', { created: 12 });
    await log(chata.id, owner.id, 'category.created', { name: 'Pivo' });

    const items = (await caller.activity.feed({})).items;
    const payloadFor = (action: string) => items.find((i) => i.action === action)?.payload;

    // `amount: 0` must survive — an `if (value)` filter would have dropped it.
    expect(payloadFor('settlement.recorded')).toEqual({ amount: 0 });
    expect(payloadFor('expenses.imported')).toEqual({ created: 12 });
    expect(payloadFor('category.created')).toEqual({ name: 'Pivo' });
  });
});
