import { beforeEach, describe, expect, it } from 'vitest';
import { createTestUser, testPrisma, resetDb } from '../test/harness.js';
import { applyStripeEvent } from './webhook.js';

function checkoutEvent(
  userId: string,
  opts: {
    id?: string;
    sessionId?: string;
    type?: 'checkout.session.completed' | 'checkout.session.async_payment_succeeded';
    paymentStatus?: 'paid' | 'unpaid';
  } = {},
) {
  return {
    id: opts.id ?? 'evt_1',
    type: opts.type ?? 'checkout.session.completed',
    data: {
      object: {
        id: opts.sessionId ?? 'cs_test_1',
        mode: 'payment',
        // Immediate payment methods (e.g. card) are 'paid' by the time
        // `completed` fires — that is the common case and the default here.
        // Delayed-notification methods (SEPA, EU bank redirects) are
        // 'unpaid' at `completed` time; see the tests below.
        payment_status: opts.paymentStatus ?? 'paid',
        metadata: { userId, scans: '5', withdrawalConsent: '2026-07-25T10:00:00.000Z' },
      },
    },
  } as never;
}

/**
 * The task brief's fixture put `current_period_start`/`current_period_end`
 * at the top level of the Subscription object. That matched Stripe API
 * versions before 2025-03-31; the installed `stripe@22.3.2` package is
 * pinned to API version `2026-06-24.dahlia`, whose `Stripe.Subscription`
 * type has no such fields — they moved onto each `SubscriptionItem`
 * (`Stripe.Subscription.items.data[].current_period_start/end`). This app's
 * checkout only ever creates a subscription with a single line item (see
 * `buildSubscriptionCheckoutParams` in `routers/billing.ts`), so the fixture
 * — and the webhook accessor it exercises — use the first item's period.
 */
function subscriptionEvent(userId: string) {
  return {
    id: 'evt_sub',
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: 'sub_1',
        status: 'active',
        cancel_at_period_end: false,
        metadata: { userId },
        items: {
          data: [
            {
              current_period_start: 1_760_000_000,
              current_period_end: 1_762_600_000,
            },
          ],
        },
      },
    },
  } as never;
}

describe('applyStripeEvent', () => {
  beforeEach(resetDb);

  it('credits a completed credit-pack purchase', async () => {
    const u = await createTestUser('a@example.com');
    await applyStripeEvent(testPrisma, checkoutEvent(u.id));
    const after = await testPrisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.creditBalance).toBe(5);
  });

  it('is idempotent for a replayed event', async () => {
    const u = await createTestUser('a@example.com');
    await applyStripeEvent(testPrisma, checkoutEvent(u.id));
    await applyStripeEvent(testPrisma, checkoutEvent(u.id));
    const after = await testPrisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.creditBalance).toBe(5);
  });

  it('records the withdrawal consent on the purchase row', async () => {
    const u = await createTestUser('a@example.com');
    await applyStripeEvent(testPrisma, checkoutEvent(u.id));
    const row = await testPrisma.scanLedger.findFirstOrThrow({ where: { userId: u.id } });
    expect(row.withdrawalConsentAt).toEqual(new Date('2026-07-25T10:00:00.000Z'));
  });

  it('grants nothing for an unpaid checkout.session.completed (delayed payment method)', async () => {
    const u = await createTestUser('a@example.com');
    await applyStripeEvent(
      testPrisma,
      checkoutEvent(u.id, { paymentStatus: 'unpaid', sessionId: 'cs_sepa' }),
    );
    const after = await testPrisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.creditBalance).toBe(0);
    expect(await testPrisma.scanLedger.count({ where: { userId: u.id } })).toBe(0);
  });

  it('credits exactly once when async_payment_succeeded later confirms a SEPA-style purchase', async () => {
    const u = await createTestUser('a@example.com');
    // The initial `completed` notification: session is not paid yet.
    await applyStripeEvent(
      testPrisma,
      checkoutEvent(u.id, {
        id: 'evt_completed',
        sessionId: 'cs_sepa',
        paymentStatus: 'unpaid',
      }),
    );
    // Days later, Stripe confirms the direct debit cleared.
    await applyStripeEvent(
      testPrisma,
      checkoutEvent(u.id, {
        id: 'evt_async_success',
        sessionId: 'cs_sepa',
        paymentStatus: 'paid',
        type: 'checkout.session.async_payment_succeeded',
      }),
    );
    const after = await testPrisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.creditBalance).toBe(5);
    expect(await testPrisma.scanLedger.count({ where: { userId: u.id } })).toBe(1);
  });

  it('still credits a card-style purchase paid immediately at checkout.session.completed', async () => {
    const u = await createTestUser('a@example.com');
    await applyStripeEvent(
      testPrisma,
      checkoutEvent(u.id, { sessionId: 'cs_card', paymentStatus: 'paid' }),
    );
    const after = await testPrisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.creditBalance).toBe(5);
  });

  it('does not double-credit if async_payment_succeeded also arrives for a session already paid at completed', async () => {
    const u = await createTestUser('a@example.com');
    // Same checkout session, reported paid by `completed`...
    await applyStripeEvent(
      testPrisma,
      checkoutEvent(u.id, {
        id: 'evt_completed_paid',
        sessionId: 'cs_immediate',
        paymentStatus: 'paid',
      }),
    );
    // ...and again by `async_payment_succeeded` — a different Stripe event
    // id, so a naive event.id-keyed idempotency check would not catch this.
    await applyStripeEvent(
      testPrisma,
      checkoutEvent(u.id, {
        id: 'evt_async_success_dup',
        sessionId: 'cs_immediate',
        paymentStatus: 'paid',
        type: 'checkout.session.async_payment_succeeded',
      }),
    );
    const after = await testPrisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.creditBalance).toBe(5);
    expect(await testPrisma.scanLedger.count({ where: { userId: u.id } })).toBe(1);
  });

  it('upserts a subscription and rolls the period forward', async () => {
    const u = await createTestUser('a@example.com');
    await applyStripeEvent(testPrisma, subscriptionEvent(u.id));
    const saved = await testPrisma.subscription.findUniqueOrThrow({
      where: { stripeSubscriptionId: 'sub_1' },
    });
    expect(saved.status).toBe('active');
    expect(saved.currentPeriodStart).toEqual(new Date(1_760_000_000 * 1000));
    expect(saved.currentPeriodEnd).toEqual(new Date(1_762_600_000 * 1000));
  });

  it('ignores event types it does not handle', async () => {
    await expect(
      applyStripeEvent(testPrisma, { id: 'evt_x', type: 'ping', data: { object: {} } } as never),
    ).resolves.toBeUndefined();
  });
});
