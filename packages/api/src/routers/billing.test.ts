import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestUser, testPrisma, makeCaller, resetDb } from '../test/harness.js';
import { resetStripeForTests } from '../billing/stripe.js';
import {
  buildSubscriptionCheckoutParams,
  buildCreditCheckoutParams,
  persistCustomerId,
} from './billing.js';

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

  /** Create a Subscription row in an arbitrary Stripe status for `user`. */
  async function seedSubscription(userId: string, status: string) {
    const now = new Date();
    await testPrisma.subscription.create({
      data: {
        userId,
        stripeSubscriptionId: `sub_${status}_${userId}`,
        status,
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 3600_000),
      },
    });
  }

  it.each(['active', 'trialing', 'past_due', 'incomplete', 'unpaid'])(
    'reports a %s subscription in the summary rather than pretending there is none',
    async (status) => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_x';
      const u = await createTestUser('a@example.com');
      await seedSubscription(u.id, status);
      const res = await makeCaller(u).billing.summary();
      expect(res.subscription).toMatchObject({ status });
    },
  );

  it.each(['past_due', 'incomplete', 'unpaid'])(
    'refuses a second checkout while a %s subscription exists',
    async (status) => {
      // The failure this closes: card expires → Stripe sets `past_due` → the
      // old summary saw no subscription and offered "Subscribe" → the customer
      // ends up with two Stripe subscriptions and, once smart retries recover
      // the first, two charges. The guard must be server-side: the client's
      // `pending` flag only covers one page load, so two open tabs bypass it.
      process.env.STRIPE_SECRET_KEY = 'sk_test_x';
      process.env.STRIPE_PRICE_CZK_VIP = 'price_czk_vip';
      const u = await createTestUser('a@example.com');
      await seedSubscription(u.id, status);
      await expect(makeCaller(u).billing.checkoutSubscription()).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    },
  );

  it.each(['canceled', 'incomplete_expired'])(
    'treats a %s subscription as gone, so a former subscriber can buy again',
    async (status) => {
      // Terminal statuses must NOT count as "already subscribed", or a
      // customer who cancelled could never come back. Asserted through
      // `summary` because `checkoutSubscription`'s only remaining step after
      // the guard is a live Stripe call, which a unit test must not make —
      // `summary.subscription` and the guard read the identical query
      // (`openSubscription`), so a null here is exactly the guard passing.
      process.env.STRIPE_SECRET_KEY = 'sk_test_x';
      const u = await createTestUser('a@example.com');
      await seedSubscription(u.id, status);
      expect((await makeCaller(u).billing.summary()).subscription).toBeNull();
    },
  );

  it('reports subscriptionAvailable per currency, not merely that Stripe is configured', async () => {
    // D7: `isBillingEnabled()` only checks STRIPE_SECRET_KEY, but the VIP
    // price id is a separate variable per currency. With CZK configured and
    // EUR missing, the English UI rendered a Subscribe button whose every
    // click came back PRECONDITION_FAILED.
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_PRICE_CZK_VIP = 'price_czk_vip';
    delete process.env.STRIPE_PRICE_EUR_VIP;
    const u = await createTestUser('a@example.com');
    const cs = await makeCaller(u).billing.summary();
    expect(cs).toMatchObject({ currency: 'CZK', subscriptionAvailable: true });
    const en = await makeCaller(u, { locale: 'en' }).billing.summary();
    expect(en).toMatchObject({ currency: 'EUR', subscriptionAvailable: false });
  });
});

describe('buildSubscriptionCheckoutParams', () => {
  it('puts userId on subscription_data.metadata so the Subscription Stripe creates carries it', () => {
    // Stripe does NOT copy Checkout Session-level metadata onto the
    // Subscription object it creates for `mode: 'subscription'` sessions.
    // Task 8's webhook reads `sub.metadata?.userId` off
    // `customer.subscription.*` events, so without `subscription_data`,
    // that is always undefined in production and no Subscription row is
    // ever persisted.
    const params = buildSubscriptionCheckoutParams({
      customerId: 'cus_123',
      priceId: 'price_123',
      userId: 'user_abc',
      successUrl: 'https://example.com/vip?checkout=success',
      cancelUrl: 'https://example.com/vip?checkout=cancelled',
    });
    expect(params.subscription_data?.metadata).toMatchObject({ userId: 'user_abc' });
    // Session-level metadata is kept too — harmless, useful for reconciliation.
    expect(params.metadata).toMatchObject({ userId: 'user_abc' });
    expect(params.mode).toBe('subscription');
    expect(params.customer).toBe('cus_123');
  });
});

describe('buildCreditCheckoutParams', () => {
  it('carries userId, scans, and the withdrawal consent timestamp in session metadata', () => {
    const consentAt = new Date('2026-01-01T00:00:00.000Z');
    const params = buildCreditCheckoutParams({
      customerId: 'cus_123',
      priceId: 'price_pack5',
      userId: 'user_abc',
      scans: 5,
      withdrawalConsentAt: consentAt,
      successUrl: 'https://example.com/vip?checkout=success',
      cancelUrl: 'https://example.com/vip?checkout=cancelled',
    });
    expect(params.metadata).toMatchObject({
      userId: 'user_abc',
      scans: '5',
      withdrawalConsent: consentAt.toISOString(),
    });
    expect(params.mode).toBe('payment');
  });
});

describe('persistCustomerId (customerIdFor race safety)', () => {
  beforeEach(() => resetDb());

  it('agrees on a single winning customer id under a concurrent first-purchase race', async () => {
    const u = await createTestUser('race@example.com');
    // Two "requests" both discover stripeCustomerId is null and each mint
    // their own Stripe customer, then race to persist it.
    const [idA, idB] = await Promise.all([
      persistCustomerId(testPrisma, u.id, 'cus_A'),
      persistCustomerId(testPrisma, u.id, 'cus_B'),
    ]);
    // Whichever write wins, both callers must return the SAME id — the
    // loser must not walk away holding a non-canonical id.
    expect(idA).toBe(idB);
    const row = await testPrisma.user.findUniqueOrThrow({
      where: { id: u.id },
      select: { stripeCustomerId: true },
    });
    // The database and the returned id must be consistent.
    expect(row.stripeCustomerId).toBe(idA);
  });
});
