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
