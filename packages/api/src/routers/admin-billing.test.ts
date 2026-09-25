/**
 * Admin billing dashboard (Stripe figures + activity charts).
 *
 * The important property here is **honesty about what is not known**. A local
 * `Subscription` row records the Stripe id, the status and the period, but not
 * the amount or the currency — the price is per-locale (CZK or EUR) and is
 * never written down. So MRR cannot be computed from this database without
 * guessing, and a dashboard that shows a confident number derived from a guess
 * is worse than one that says it does not know.
 *
 * Hence two rules these tests pin:
 *   1. Counts, credits and daily activity are computed locally and are exact.
 *   2. MRR is either a real figure read from Stripe, or `null` — never zero.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeCaller, createTestUser, testPrisma, resetDb } from '../test/harness.js';
import { resetStripeForTests } from '../billing/stripe.js';

async function makeAdmin(email: string) {
  const user = await createTestUser(email);
  await testPrisma.user.update({ where: { id: user.id }, data: { isAdmin: true } });
  return makeCaller(user);
}

/** A subscription row as the webhook would have left it. */
async function addSubscription(userId: string, status: string, cancelAtPeriodEnd = false) {
  return testPrisma.subscription.create({
    data: {
      userId,
      stripeSubscriptionId: `sub_${status}_${userId}`,
      status,
      currentPeriodStart: new Date('2026-09-01'),
      currentPeriodEnd: new Date('2026-10-01'),
      cancelAtPeriodEnd,
    },
  });
}

const ORIGINAL_KEY = process.env.STRIPE_SECRET_KEY;

beforeEach(async () => {
  await resetDb();
  delete process.env.STRIPE_SECRET_KEY;
  resetStripeForTests();
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = ORIGINAL_KEY;
  resetStripeForTests();
});

describe('admin.billingStats — access', () => {
  it('refuses a non-admin', async () => {
    const user = await createTestUser('bob@example.com');
    await expect(makeCaller(user).admin.billingStats()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('admin.billingStats — subscription counts', () => {
  it('counts subscriptions by status exactly as stored', async () => {
    const admin = await makeAdmin('admin@example.com');
    const a = await createTestUser('a@example.com');
    const b = await createTestUser('b@example.com');
    const c = await createTestUser('c@example.com');
    const d = await createTestUser('d@example.com');
    await addSubscription(a.id, 'active');
    await addSubscription(b.id, 'active');
    await addSubscription(c.id, 'trialing');
    await addSubscription(d.id, 'past_due');

    const stats = await admin.admin.billingStats();

    expect(stats.subscriptions.active).toBe(2);
    expect(stats.subscriptions.trialing).toBe(1);
    expect(stats.subscriptions.pastDue).toBe(1);
  });

  it('separates a subscription that is cancelling at period end', async () => {
    const admin = await makeAdmin('admin@example.com');
    const a = await createTestUser('a@example.com');
    await addSubscription(a.id, 'active', true);

    const stats = await admin.admin.billingStats();

    // Still active, but not renewing — the number an operator actually needs.
    expect(stats.subscriptions.active).toBe(1);
    expect(stats.subscriptions.cancelingAtPeriodEnd).toBe(1);
  });
});

describe('admin.billingStats — MRR is never invented', () => {
  it('reports MRR as unknown when Stripe is not configured', async () => {
    const admin = await makeAdmin('admin@example.com');

    const stats = await admin.admin.billingStats();

    expect(stats.stripeConfigured).toBe(false);
    // The crucial assertion: not zero. Zero reads as "we have no revenue",
    // which is a different and false claim.
    expect(stats.mrr).toBeNull();
    expect(stats.mrrUnavailableReason).toBeTruthy();
  });

  it('still reports the local facts when Stripe is unavailable', async () => {
    const admin = await makeAdmin('admin@example.com');
    const a = await createTestUser('a@example.com');
    await addSubscription(a.id, 'active');

    const stats = await admin.admin.billingStats();

    // The counts are exact and independent of Stripe.
    expect(stats.subscriptions.active).toBe(1);
    expect(stats.stripeConfigured).toBe(false);
  });
});

describe('admin.billingStats — credits and activity', () => {
  it('sums outstanding credits as a liability', async () => {
    const admin = await makeAdmin('admin@example.com');
    await createTestUser('a@example.com');
    await testPrisma.user.update({
      where: { email: 'a@example.com' },
      data: { creditBalance: 7 },
    });
    await testPrisma.user.create({
      data: { email: 'b@example.com', name: 'b', creditBalance: 3 },
    });

    const stats = await admin.admin.billingStats();

    expect(stats.creditsOutstanding).toBe(10);
  });

  it('returns a dense 30-day signup series ending today', async () => {
    const admin = await makeAdmin('admin@example.com');

    const stats = await admin.admin.billingStats();

    expect(stats.signupsPerDay).toHaveLength(30);
    // The last bucket is today.
    expect(stats.signupsPerDay[29]?.date).toBe(new Date().toISOString().slice(0, 10));
    // No gaps: a sparse series silently mis-draws a chart.
    expect(stats.signupsPerDay.every((d) => typeof d.count === 'number')).toBe(true);
  });

  it('counts a signup on the right day', async () => {
    const admin = await makeAdmin('admin@example.com');
    const user = await createTestUser('today@example.com');
    await testPrisma.user.update({
      where: { id: user.id },
      data: { createdAt: new Date() },
    });

    const stats = await admin.admin.billingStats();
    const today = stats.signupsPerDay[29]!;
    expect(today.count).toBeGreaterThanOrEqual(1);
  });

  it('returns a dense 30-day scan series', async () => {
    const admin = await makeAdmin('admin@example.com');
    const stats = await admin.admin.billingStats();
    expect(stats.scansPerDay).toHaveLength(30);
  });
});
