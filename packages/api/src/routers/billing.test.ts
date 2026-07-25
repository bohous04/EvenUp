import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestUser, testPrisma, makeCaller, resetDb } from '../test/harness.js';
import { resetStripeForTests } from '../billing/stripe.js';

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  // getStripe() memoises the client, so a test that ran without a key would
  // otherwise poison every later test that sets one.
  resetStripeForTests();
});

describe('billing router', () => {
  beforeEach(() => {
    resetStripeForTests();
    return resetDb();
  });

  it('reports the balance and that billing is off when unconfigured', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const u = await createTestUser('a@example.com');
    const res = await makeCaller(u).billing.summary();
    expect(res).toMatchObject({ billingEnabled: false, creditBalance: 0, packs: [] });
  });

  it('reports a credit balance', async () => {
    const u = await createTestUser('a@example.com');
    await testPrisma.user.update({ where: { id: u.id }, data: { creditBalance: 7 } });
    expect((await makeCaller(u).billing.summary()).creditBalance).toBe(7);
  });

  it('refuses a credit checkout without the withdrawal acknowledgement', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_PRICE_CZK_PACK_5 = 'price_czk_5';
    const u = await createTestUser('a@example.com');
    await expect(
      makeCaller(u).billing.checkoutCredits({ packId: 'pack5', acknowledgeImmediate: false }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('refuses checkout entirely when billing is disabled', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const u = await createTestUser('a@example.com');
    await expect(makeCaller(u).billing.checkoutSubscription()).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
  });
});
