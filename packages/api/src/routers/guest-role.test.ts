/**
 * The view-only GUEST role (FR-2.6).
 *
 * Groups are deliberately flat — an ADMIN and a plain MEMBER can both do
 * everything, and that is intended, not a gap. GUEST is the one privilege tier:
 * someone who follows a trip without being part of the finances. They read the
 * group; they never change it.
 *
 * The risk these tests exist to close is that "read-only" is only ever enforced
 * in the UI. Every mutating procedure has to reject a guest at the API, because
 * the API is reachable directly and the web client is not the only caller.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeCaller, createTestUser, resetDb, testPrisma } from '../test/harness.js';

beforeAll(async () => {
  await testPrisma.$queryRaw`SELECT 1`;
});
beforeEach(async () => {
  await resetDb();
});

/**
 * A group whose second participant arrived through a real invite and chose to
 * join as a view-only guest.
 *
 * Claiming an invite — rather than calling `member.add` with `role: 'GUEST'` —
 * is the path a guest actually takes, and it is the only one that produces an
 * *account-linked* member row. `member.add` creates a virtual member (name and
 * colour, no account), so a "guest" built that way is not a member of anything
 * as far as the access layer is concerned.
 */
async function seedGroupWithGuest() {
  const owner = await createTestUser('owner@example.com');
  const guest = await createTestUser('guest@example.com');
  const ownerCaller = makeCaller(owner);

  const group = await ownerCaller.group.create({
    name: 'Tatry 2026',
    template: 'TRIP',
    baseCurrency: 'CZK',
  });
  const ownerMember = group.members[0]!;

  const invite = await ownerCaller.invite.create({ groupId: group.id });
  const guestCaller = makeCaller(guest);
  const claimed = await guestCaller.invite.claim({ token: invite.token, role: 'GUEST' });

  return {
    owner,
    ownerCaller,
    guest,
    guestCaller,
    group,
    ownerMember,
    guestMember: claimed,
  };
}

describe('guest role — reading is allowed', () => {
  it('lets a guest see the group', async () => {
    const { guestCaller, group } = await seedGroupWithGuest();
    const got = await guestCaller.group.get({ groupId: group.id });
    expect(got.id).toBe(group.id);
  });

  it('lets a guest see balances and the suggested payments', async () => {
    const { guestCaller, group, ownerMember } = await seedGroupWithGuest();
    const balance = await guestCaller.balance.get({ groupId: group.id });
    expect(Array.isArray(balance.balances)).toBe(true);
    // The settlement is part of the same read: a guest's whole point is being
    // able to see who owes what without being able to change it.
    expect(Array.isArray(balance.payments)).toBe(true);
    expect(ownerMember.role).toBe('ADMIN');
  });

  it('lets a guest list the group activity feed', async () => {
    const { guestCaller, group } = await seedGroupWithGuest();
    const feed = await guestCaller.activity.list({ groupId: group.id });
    expect(Array.isArray(feed.items)).toBe(true);
  });
});

describe('guest role — writing is refused', () => {
  it('refuses to add an expense', async () => {
    const { guestCaller, group, guestMember } = await seedGroupWithGuest();
    await expect(
      guestCaller.transaction.createExpense({
        groupId: group.id,
        title: 'Chata',
        currency: 'CZK',
        date: new Date('2026-06-22'),
        payers: [{ memberId: guestMember.id, amountMinorUnits: 10_000 }],
        split: { type: 'EQUAL', members: [{ memberId: guestMember.id }] },
      }),
    ).rejects.toThrow(/read-only|guest/i);
  });

  it('refuses to record a settlement transfer', async () => {
    const { guestCaller, group, guestMember, ownerMember } = await seedGroupWithGuest();
    await expect(
      guestCaller.transaction.recordTransfer({
        groupId: group.id,
        fromMemberId: guestMember.id,
        toMemberId: ownerMember.id,
        amountMinorUnits: 5_000,
        currency: 'CZK',
        method: 'CASH',
      }),
    ).rejects.toThrow(/read-only|guest/i);
  });

  it('refuses to rename the group', async () => {
    const { guestCaller, group } = await seedGroupWithGuest();
    await expect(
      guestCaller.group.update({ groupId: group.id, name: 'Renamed by a guest' }),
    ).rejects.toThrow(/read-only|guest/i);
  });

  it('refuses to add another member', async () => {
    const { guestCaller, group } = await seedGroupWithGuest();
    await expect(
      guestCaller.member.add({ groupId: group.id, displayName: 'Another' }),
    ).rejects.toThrow(/read-only|guest/i);
  });

  it('refuses to archive the group', async () => {
    const { guestCaller, group } = await seedGroupWithGuest();
    await expect(guestCaller.group.archive({ groupId: group.id, archived: true })).rejects.toThrow(
      /read-only|guest/i,
    );
  });

  it('refuses to invite anyone else', async () => {
    const { guestCaller, group } = await seedGroupWithGuest();
    await expect(guestCaller.invite.create({ groupId: group.id })).rejects.toThrow(
      /read-only|guest/i,
    );
  });

  it('leaves the data untouched when a write is refused', async () => {
    const { guestCaller, group } = await seedGroupWithGuest();
    await expect(
      guestCaller.group.update({ groupId: group.id, name: 'Renamed by a guest' }),
    ).rejects.toThrow();
    const stored = await testPrisma.group.findUniqueOrThrow({ where: { id: group.id } });
    expect(stored.name).toBe('Tatry 2026');
  });
});

describe('guest role — a plain member is unaffected', () => {
  it('still lets an ordinary member rename the group', async () => {
    const { ownerCaller, group } = await seedGroupWithGuest();
    const member = await createTestUser('member@example.com');
    const memberCaller = makeCaller(member);
    const joined = await memberCaller.invite.claim({
      token: await createInviteFor(ownerCaller, group.id),
    });
    expect(joined.id).toBeTruthy();

    await expect(
      memberCaller.group.update({ groupId: group.id, name: 'Renamed by a member' }),
    ).resolves.toMatchObject({ name: 'Renamed by a member' });
  });
});

/** Creates a single-use invite the member can claim. */
async function createInviteFor(caller: ReturnType<typeof makeCaller>, groupId: string) {
  const invite = await caller.invite.create({ groupId });
  return invite.token;
}
