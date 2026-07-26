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

describe('user.setOcrConsent', () => {
  beforeEach(resetDb);

  it('grants consent (sets a timestamp) and revokes it back to null', async () => {
    const user = await createTestUser('consent@example.com');
    const caller = makeCaller(user);

    await caller.user.setOcrConsent({ granted: true });
    const granted = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(granted.ocrConsentAt).not.toBeNull();

    await caller.user.setOcrConsent({ granted: false });
    const revoked = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(revoked.ocrConsentAt).toBeNull();
  });

  it('exposes ocrConsentAt on me so the client can prompt for consent', async () => {
    const u = await createTestUser('consent2@example.com');
    const before = await makeCaller(u).user.me();
    expect(before.ocrConsentAt).toBeNull();

    await makeCaller(u).user.setOcrConsent({ granted: true });
    const after = await makeCaller(u).user.me();
    expect(after.ocrConsentAt).toBeInstanceOf(Date);
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

  it('includes subscription state and the scan ledger under billing (FR-1.6 vs billing completeness)', async () => {
    const user = await createTestUser('export-billing@example.com');
    const caller = makeCaller(user);

    const periodStart = new Date('2026-01-01T00:00:00Z');
    const periodEnd = new Date('2026-02-01T00:00:00Z');
    await testPrisma.subscription.create({
      data: {
        userId: user.id,
        // Not cleared by resetDb (see harness.ts) -- keyed off the fresh
        // per-run user id so reruns against the shared test DB don't collide
        // on the table's unique stripeSubscriptionId constraint.
        stripeSubscriptionId: `sub_export_${user.id}`,
        status: 'active',
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      },
    });
    await testPrisma.scanLedger.createMany({
      data: [
        { userId: user.id, delta: 5, reason: 'PURCHASE', stripeEventId: 'evt_export_1' },
        { userId: user.id, delta: -1, reason: 'CREDIT_SCAN' },
      ],
    });

    const exported = await caller.user.exportData();

    expect(exported.billing.subscriptions).toEqual([
      {
        stripeSubscriptionId: `sub_export_${user.id}`,
        status: 'active',
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        createdAt: expect.any(Date),
      },
    ]);
    expect(exported.billing.ledger).toEqual([
      {
        delta: 5,
        reason: 'PURCHASE',
        stripeEventId: 'evt_export_1',
        withdrawalConsentAt: null,
        createdAt: expect.any(Date),
      },
      {
        delta: -1,
        reason: 'CREDIT_SCAN',
        stripeEventId: null,
        withdrawalConsentAt: null,
        createdAt: expect.any(Date),
      },
    ]);
  });

  /**
   * The export is described to users as "complete" (`legal.privacy.s9.li1`),
   * which makes an omission a false statement in a privacy policy rather than
   * a missing field. These four went missing when billing and OCR consent
   * landed: the consent record spec 2 names explicitly, the balance the
   * customer paid for, the identifier that resolves to them at Stripe, and the
   * distance-selling waiver recorded against a purchase.
   */
  it('carries the OCR consent record, the credit balance, the Stripe customer id and the withdrawal consent', async () => {
    const user = await createTestUser('export-consent@example.com');
    const caller = makeCaller(user);
    await caller.user.setOcrConsent({ granted: true });

    const consentedAt = new Date('2026-03-04T09:00:00Z');
    await testPrisma.user.update({
      where: { id: user.id },
      data: { creditBalance: 7, stripeCustomerId: `cus_export_${user.id}` },
    });
    await testPrisma.scanLedger.create({
      data: {
        userId: user.id,
        delta: 5,
        reason: 'PURCHASE',
        stripeEventId: `evt_consent_${user.id}`,
        withdrawalConsentAt: consentedAt,
      },
    });

    const exported = await caller.user.exportData();

    expect(exported.profile.ocrConsentAt).toBeInstanceOf(Date);
    expect(exported.profile.creditBalance).toBe(7);
    expect(exported.profile.stripeCustomerId).toBe(`cus_export_${user.id}`);
    expect(exported.billing.ledger).toEqual([
      expect.objectContaining({ withdrawalConsentAt: consentedAt }),
    ]);
  });

  /**
   * Every remaining category the privacy policy's §2 declares, so "complete"
   * stays true as the schema grows: sign-in records (li2, with the IP address
   * and browser its retention line now promises to delete), linked social
   * accounts (s8.p2), notification settings and sends (li8), and error records
   * (li9).
   */
  it('covers sign-in records, connected accounts, notifications and error records', async () => {
    const user = await createTestUser('export-categories@example.com');
    const caller = makeCaller(user);
    const { group } = await createGroupWithLinkedMember(user, 'Export');

    await testPrisma.session.create({
      data: {
        userId: user.id,
        token: `tok_export_${user.id}`,
        expiresAt: new Date('2030-01-01T00:00:00Z'),
        ipAddress: '203.0.113.9',
        userAgent: 'Mozilla/5.0 (export test)',
      },
    });
    await testPrisma.account.create({
      data: { userId: user.id, providerId: 'google', accountId: `acct_${user.id}` },
    });
    await testPrisma.notificationPreference.create({
      data: { userId: user.id, groupId: group.id, muted: true },
    });
    await testPrisma.notificationDelivery.create({
      data: {
        userId: user.id,
        kind: 'digest',
        channel: 'email',
        idempotencyKey: `idem_export_${user.id}`,
        status: 'sent',
        payload: {},
      },
    });
    await testPrisma.errorLog.create({
      data: { userId: user.id, source: 'ocr', code: 'INTERNAL_SERVER_ERROR', message: 'boom' },
    });

    const exported = await caller.user.exportData();

    expect(exported.sessions).toEqual([
      expect.objectContaining({ ipAddress: '203.0.113.9', userAgent: 'Mozilla/5.0 (export test)' }),
    ]);
    expect(exported.connectedAccounts).toEqual([expect.objectContaining({ providerId: 'google' })]);
    expect(exported.notifications.preferences).toEqual([
      expect.objectContaining({ groupId: group.id, muted: true }),
    ]);
    expect(exported.notifications.deliveries).toEqual([
      expect.objectContaining({ kind: 'digest', channel: 'email', status: 'sent' }),
    ]);
    expect(exported.errorLogs).toEqual([
      expect.objectContaining({ source: 'ocr', message: 'boom' }),
    ]);

    // Credentials are never exported, however "complete" the export is: a
    // session token is a live login, and the OAuth tokens and password hash
    // let somebody act as this person somewhere else. (The replacer is for the
    // BigInt money columns an exported transaction carries — `JSON.stringify`
    // throws on those rather than returning a string to search.)
    const serialized = JSON.stringify(exported, (_key, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value,
    );
    expect(serialized).not.toContain(`tok_export_${user.id}`);
    for (const field of ['accessToken', 'refreshToken', 'password', 'token']) {
      expect(serialized, field).not.toContain(`"${field}"`);
    }
  });
});
