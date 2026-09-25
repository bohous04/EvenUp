/**
 * Idempotent expense creation — the foundation of offline entry.
 *
 * An offline queue must retry. A retry is only safe if the server can tell a
 * repeat of a request it already handled from a genuinely new one. Without
 * that, the classic failure is: the request succeeds, the response is lost on a
 * bad connection, the client retries, and the expense is booked twice. The
 * user sees one dinner in the app and two in their bank statement.
 *
 * `clientMutationId` is the key. It is minted by the queue, unique per group,
 * and deliberately nullable so every existing caller and row is unaffected.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeCaller, createTestUser, testPrisma, resetDb } from '../test/harness.js';

beforeAll(async () => {
  await testPrisma.$queryRaw`SELECT 1`;
});
beforeEach(async () => {
  await resetDb();
});

async function seed() {
  const user = await createTestUser('owner@example.com');
  const caller = makeCaller(user);
  const group = await caller.group.create({
    name: 'Tatry 2026',
    template: 'TRIP',
    baseCurrency: 'CZK',
  });
  const member = group.members[0]!;
  return { caller, group, member };
}

function expense(groupId: string, memberId: string, clientMutationId?: string) {
  return {
    groupId,
    title: 'Chata',
    currency: 'CZK',
    date: new Date('2026-06-22'),
    payers: [{ memberId, amountMinorUnits: 10_000 }],
    split: { type: 'EQUAL' as const, members: [{ memberId }] },
    ...(clientMutationId ? { clientMutationId } : {}),
  };
}

describe('createExpense idempotency', () => {
  it('creates the expense on the first call', async () => {
    const { caller, group, member } = await seed();
    const tx = await caller.transaction.createExpense(expense(group.id, member.id, 'queue-item-1'));
    expect(tx.id).toBeTruthy();
    expect(tx.clientMutationId).toBe('queue-item-1');
  });

  it('returns the SAME transaction when the same key is retried', async () => {
    const { caller, group, member } = await seed();
    const first = await caller.transaction.createExpense(
      expense(group.id, member.id, 'queue-item-1'),
    );
    const second = await caller.transaction.createExpense(
      expense(group.id, member.id, 'queue-item-1'),
    );
    expect(second.id).toBe(first.id);
  });

  it('books the expense exactly once across many retries', async () => {
    const { caller, group, member } = await seed();
    for (let i = 0; i < 5; i++) {
      await caller.transaction.createExpense(expense(group.id, member.id, 'queue-item-1'));
    }
    const items = await caller.transaction.list({ groupId: group.id });
    expect(items).toHaveLength(1);
  });

  it('still creates separate expenses for different keys', async () => {
    const { caller, group, member } = await seed();
    await caller.transaction.createExpense(expense(group.id, member.id, 'queue-item-1'));
    await caller.transaction.createExpense(expense(group.id, member.id, 'queue-item-2'));
    const items = await caller.transaction.list({ groupId: group.id });
    expect(items).toHaveLength(2);
  });

  /**
   * The key is scoped to the group, not global. Two devices queueing the same
   * id (a shared/copied id, or a clock-seeded generator colliding) must not
   * make the second device's expense vanish into the first one's group.
   */
  it('scopes the key to the group, not globally', async () => {
    const { caller, group, member } = await seed();
    const other = await caller.group.create({ name: 'Jiné', baseCurrency: 'CZK' });
    const otherMember = other.members[0]!;

    const a = await caller.transaction.createExpense(expense(group.id, member.id, 'shared-id'));
    const b = await caller.transaction.createExpense(
      expense(other.id, otherMember.id, 'shared-id'),
    );

    expect(b.id).not.toBe(a.id);
  });

  it('leaves a caller that sends no key unaffected', async () => {
    const { caller, group, member } = await seed();
    const first = await caller.transaction.createExpense(expense(group.id, member.id));
    const second = await caller.transaction.createExpense(expense(group.id, member.id));
    expect(second.id).not.toBe(first.id);
    const items = await caller.transaction.list({ groupId: group.id });
    expect(items).toHaveLength(2);
  });

  /**
   * The retry must be idempotent even when the payload differs — a queue that
   * was re-hydrated from storage could hand back a slightly edited record. The
   * first write wins, because that is the one the user actually saw.
   */
  it('keeps the original when a retry arrives with different content', async () => {
    const { caller, group, member } = await seed();
    const first = await caller.transaction.createExpense(
      expense(group.id, member.id, 'queue-item-1'),
    );
    const changed = {
      ...expense(group.id, member.id, 'queue-item-1'),
      title: 'Something else entirely',
    };
    const second = await caller.transaction.createExpense(changed);
    expect(second.id).toBe(first.id);
    expect(second.title).toBe('Chata');
  });

  it("stores another user's key without touching their expense", async () => {
    const { caller, group, member } = await seed();
    const otherUser = await createTestUser('other@example.com');
    const otherCaller = makeCaller(otherUser);
    const otherGroup = await otherCaller.group.create({ name: 'Jiné' });
    const otherMember = otherGroup.members[0]!;

    await caller.transaction.createExpense(expense(group.id, member.id, 'queue-item-1'));
    const b = await otherCaller.transaction.createExpense(
      expense(otherGroup.id, otherMember.id, 'queue-item-1'),
    );

    expect(b.clientMutationId).toBe('queue-item-1');
    const items = await caller.transaction.list({ groupId: group.id });
    expect(items).toHaveLength(1);
  });
});
