import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import { createTestUser, testPrisma, makeCaller, resetDb } from '../test/harness.js';
import { resetStripeForTests } from '../billing/stripe.js';
import { TRIAL_PERIOD_DAYS } from '../billing/prices.js';
import {
  buildSubscriptionCheckoutParams,
  buildCreditCheckoutParams,
  persistCustomerId,
} from './billing.js';

/**
 * A fake Stripe client, so `checkoutSubscription` can be driven end to end
 * without a network call.
 *
 * The gap this closes: `buildSubscriptionCheckoutParams` was tested purely and
 * `hasEverSubscribed` was tested through `summary.trialEligible`, but the one
 * line in `checkoutSubscription` that joins them — the line deciding whether
 * the customer is charged — was covered by nothing. Both wrong versions of it
 * (`= TRIAL_PERIOD_DAYS`, an unlimited free ride for returning customers, and
 * `= undefined`, a trial that never happens) passed the entire api suite.
 */
const stripeMock = vi.hoisted(() => ({
  checkout: { sessions: { create: vi.fn() } },
  customers: { create: vi.fn() },
}));

vi.mock('../billing/stripe.js', () => ({
  // Mirrors the real factory's contract rather than always returning a client:
  // several tests below assert the unconfigured, self-hosted path, and they
  // must keep exercising it.
  getStripe: () => (process.env.STRIPE_SECRET_KEY ? (stripeMock as unknown as Stripe) : null),
  // The real one only drops a memoised client; this fake reads the env on
  // every call, so there is nothing to forget.
  resetStripeForTests: () => {},
}));

/** The params `checkoutSubscription` handed Stripe on its only call. */
function sessionParams(): Stripe.Checkout.SessionCreateParams {
  const calls = stripeMock.checkout.sessions.create.mock.calls;
  expect(calls, 'checkoutSubscription should open exactly one Stripe session').toHaveLength(1);
  const first = calls.at(0);
  if (!first) throw new Error('checkoutSubscription never called Stripe');
  return first[0] as Stripe.Checkout.SessionCreateParams;
}

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
    stripeMock.checkout.sessions.create.mockReset();
    stripeMock.checkout.sessions.create.mockResolvedValue({
      url: 'https://checkout.stripe.test/session',
    });
    stripeMock.customers.create.mockReset();
    stripeMock.customers.create.mockResolvedValue({ id: 'cus_test' });
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

  it('reports a user who has never subscribed as eligible for the free trial', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    const u = await createTestUser('a@example.com');
    expect((await makeCaller(u).billing.summary()).trialEligible).toBe(true);
  });

  it.each([
    'active',
    'trialing',
    'past_due',
    'incomplete',
    'unpaid',
    'canceled',
    'incomplete_expired',
  ])('reports a user whose subscription is %s as no longer trial-eligible', async (status) => {
    // The point of the `canceled` / `incomplete_expired` rows in this list:
    // trial eligibility is a BROADER question than `openSubscription()`,
    // which treats exactly those two as gone so a former subscriber can buy
    // again. They must still burn the trial, or cancel-and-resubscribe is an
    // unlimited free ride — Stripe does not enforce one trial per customer.
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    const u = await createTestUser('a@example.com');
    await seedSubscription(u.id, status);
    expect((await makeCaller(u).billing.summary()).trialEligible).toBe(false);
  });

  it('keeps selling a subscription to a former subscriber, just without the trial', async () => {
    // The two questions pull in opposite directions for a terminal status and
    // both answers have to hold at once: still purchasable, no longer free.
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    const u = await createTestUser('a@example.com');
    await seedSubscription(u.id, 'canceled');
    const res = await makeCaller(u).billing.summary();
    expect(res.subscription).toBeNull();
    expect(res.trialEligible).toBe(false);
  });

  it('opens a first-time subscriber’s checkout with the free trial', async () => {
    // The wiring test. `trialEligible` on the summary and the pure params
    // builder were both already covered; what was not is that
    // `checkoutSubscription` passes the eligibility answer into the builder.
    // Mutating that line to `= undefined` — the trial silently never happens
    // for anyone — has to fail here and nowhere else.
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_PRICE_CZK_VIP = 'price_czk_vip';
    const u = await createTestUser('a@example.com');
    await makeCaller(u).billing.checkoutSubscription();
    expect(sessionParams().subscription_data?.trial_period_days).toBe(TRIAL_PERIOD_DAYS);
  });

  it('opens a returning subscriber’s checkout with no trial at all', async () => {
    // The other half, and the expensive one: mutating the same line to
    // `= TRIAL_PERIOD_DAYS` gives every customer who cancels another free week
    // for as long as they care to repeat it. Stripe enforces no
    // one-trial-per-customer rule of its own.
    //
    // `canceled` on purpose: it is terminal, so `openSubscription` treats the
    // customer as sellable and checkout proceeds — which is exactly the state
    // in which the trial must not be granted. The key has to be absent, not
    // zero: Stripe rejects `trial_period_days: 0`.
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_PRICE_CZK_VIP = 'price_czk_vip';
    const u = await createTestUser('a@example.com');
    await seedSubscription(u.id, 'canceled');
    await makeCaller(u).billing.checkoutSubscription();
    expect(sessionParams().subscription_data).not.toHaveProperty('trial_period_days');
    // Still a real subscription checkout, not a silently degraded one.
    expect(sessionParams().subscription_data?.metadata).toMatchObject({ userId: u.id });
  });

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
  const args = {
    customerId: 'cus_123',
    priceId: 'price_123',
    userId: 'user_abc',
    successUrl: 'https://example.com/vip?checkout=success',
    cancelUrl: 'https://example.com/vip?checkout=cancelled',
  };

  it('puts userId on subscription_data.metadata so the Subscription Stripe creates carries it', () => {
    // Stripe does NOT copy Checkout Session-level metadata onto the
    // Subscription object it creates for `mode: 'subscription'` sessions.
    // Task 8's webhook reads `sub.metadata?.userId` off
    // `customer.subscription.*` events, so without `subscription_data`,
    // that is always undefined in production and no Subscription row is
    // ever persisted.
    const params = buildSubscriptionCheckoutParams(args);
    expect(params.subscription_data?.metadata).toMatchObject({ userId: 'user_abc' });
    // Session-level metadata is kept too — harmless, useful for reconciliation.
    expect(params.metadata).toMatchObject({ userId: 'user_abc' });
    expect(params.mode).toBe('subscription');
    expect(params.customer).toBe('cus_123');
  });

  it('asks Stripe for the free trial when the caller says the user is eligible', () => {
    const params = buildSubscriptionCheckoutParams({ ...args, trialPeriodDays: TRIAL_PERIOD_DAYS });
    expect(params.subscription_data?.trial_period_days).toBe(TRIAL_PERIOD_DAYS);
    // The trial must EXTEND `subscription_data`, never replace it: dropping
    // the metadata is how the webhook stops seeing a userId and no
    // Subscription row is ever written — VIP would silently never activate,
    // and the trial with it.
    expect(params.subscription_data?.metadata).toMatchObject({ userId: 'user_abc' });
  });

  it('omits trial_period_days entirely for a returning subscriber', () => {
    // Not `trial_period_days: 0` — Stripe rejects that. The key must be
    // absent, which is what a returning subscriber's checkout has to look
    // like or the trial is repeatable by cancelling and buying again.
    const params = buildSubscriptionCheckoutParams(args);
    expect(params.subscription_data).not.toHaveProperty('trial_period_days');
    expect(params.subscription_data?.metadata).toMatchObject({ userId: 'user_abc' });
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
