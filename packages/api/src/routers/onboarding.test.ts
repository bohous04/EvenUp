/**
 * First-run onboarding.
 *
 * The account-number field, the "why we need it" copy and the Czech IBAN
 * validation all already exist in Settings — what was missing was a first run
 * that surfaces them, and any record that a user had already declined. These
 * tests pin that record, because the failure mode is subtle and annoying: a
 * user who explicitly skips the prompt must never be asked again, and a fresh
 * sign-up must always be asked once.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeCaller, createTestUser, resetDb, testPrisma } from '../test/harness.js';

beforeAll(async () => {
  await testPrisma.$queryRaw`SELECT 1`;
});
beforeEach(async () => {
  await resetDb();
});

describe('onboarding completion flag', () => {
  it('is null for a brand-new account, which is what "has not seen it" means', async () => {
    const user = await createTestUser('new@example.com');
    const me = await makeCaller(user).user.me();
    expect(me.onboardingCompletedAt).toBeNull();
  });

  it('records a completed onboarding', async () => {
    const user = await createTestUser('new@example.com');
    const caller = makeCaller(user);

    await caller.user.updateSettings({ onboardingCompletedAt: new Date('2026-09-25T10:00:00Z') });

    const me = await caller.user.me();
    expect(me.onboardingCompletedAt).not.toBeNull();
  });

  /**
   * The whole point of storing a timestamp rather than a boolean: a user who
   * *skipped* the bank-account prompt has still finished onboarding. A boolean
   * `skippedBankAccount` would have been easy to read as "not onboarded yet" and
   * re-prompt them on every visit.
   */
  it('records a skip, so a declined prompt is never shown twice', async () => {
    const user = await createTestUser('new@example.com');
    const caller = makeCaller(user);

    await caller.user.updateSettings({ onboardingCompletedAt: new Date() });

    const me = await caller.user.me();
    expect(me.onboardingCompletedAt).not.toBeNull();
    // No bank account was stored — the skip is honest about that.
    expect(me.hasBankAccount).toBe(false);
  });

  it('leaves the flag alone when a later settings change omits it', async () => {
    const user = await createTestUser('new@example.com');
    const caller = makeCaller(user);
    await caller.user.updateSettings({ onboardingCompletedAt: new Date('2026-09-25T10:00:00Z') });

    // A locale change from the Settings page must not clear it.
    await caller.user.updateSettings({ locale: 'en' });

    const me = await caller.user.me();
    expect(me.onboardingCompletedAt).not.toBeNull();
  });

  it('does not let one user mark another onboarded', async () => {
    const user = await createTestUser('new@example.com');
    const other = await createTestUser('other@example.com');
    const caller = makeCaller(user);

    await caller.user.updateSettings({ onboardingCompletedAt: new Date() });

    const otherMe = await makeCaller(other).user.me();
    expect(otherMe.onboardingCompletedAt).toBeNull();
  });
});

describe('the bank account prompt it front-loads', () => {
  it('stores a valid Czech account and marks it present', async () => {
    const user = await createTestUser('new@example.com');
    const caller = makeCaller(user);

    const res = await caller.user.setBankAccount({ account: '19-2000145399/0800' });

    expect(res.ok).toBe(true);
    const me = await caller.user.me();
    expect(me.hasBankAccount).toBe(true);
  });

  it('still refuses a malformed account number', async () => {
    const user = await createTestUser('new@example.com');
    const caller = makeCaller(user);
    await expect(caller.user.setBankAccount({ account: 'not-an-account' })).rejects.toThrow();
  });
});
