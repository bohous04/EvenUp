import { beforeEach, describe, expect, it } from 'vitest';
import { createTestUser, testPrisma, resetDb } from '../test/harness.js';
import { applyStripeEvent } from './webhook.js';

function checkoutEvent(userId: string, id = 'evt_1') {
  return {
    id,
    type: 'checkout.session.completed',
    data: {
      object: {
        mode: 'payment',
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
