/**
 * Stripe event effects. Signature verification happens in the route handler;
 * by the time an event reaches here it is trusted. Every effect is idempotent
 * because Stripe retries and replays.
 */
import type Stripe from 'stripe';
import type { PrismaClient } from '@evenup/db';
import { creditPurchase } from './ledger.js';

/**
 * API versions from 2025-03-31 onward removed `current_period_start`/
 * `current_period_end` from the Subscription object itself; they now live on
 * each SubscriptionItem (`Stripe.Subscription.items.data[].current_period_*`).
 * Confirmed against the installed `stripe@22.3.2` package's types, which are
 * pinned to API version `2026-06-24.dahlia` — `Stripe.Subscription` has no
 * top-level period fields any more. This app's checkout only ever creates a
 * subscription with a single line item (see `buildSubscriptionCheckoutParams`
 * in `routers/billing.ts`), so the first item's period is the subscription's
 * period.
 */
function subscriptionPeriod(sub: Stripe.Subscription): { start: Date; end: Date } {
  const item = sub.items.data[0];
  if (!item) throw new Error(`subscription ${sub.id} has no items`);
  return {
    start: new Date(item.current_period_start * 1000),
    end: new Date(item.current_period_end * 1000),
  };
}

async function upsertSubscription(
  prisma: PrismaClient,
  sub: Stripe.Subscription & { metadata?: Record<string, string> },
): Promise<void> {
  const userId = sub.metadata?.userId;
  if (!userId) return;
  const { start, end } = subscriptionPeriod(sub);
  const data = {
    userId,
    status: sub.status,
    currentPeriodStart: start,
    currentPeriodEnd: end,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
  };
  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: sub.id },
    create: { ...data, stripeSubscriptionId: sub.id },
    update: data,
  });
}

export async function applyStripeEvent(prisma: PrismaClient, event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== 'payment') return; // subscriptions arrive as their own events
      const userId = session.metadata?.userId;
      const scans = Number(session.metadata?.scans ?? 0);
      const consent = session.metadata?.withdrawalConsent;
      if (!userId || !Number.isInteger(scans) || scans <= 0 || !consent) return;
      await creditPurchase(prisma, {
        userId,
        scans,
        stripeEventId: event.id,
        withdrawalConsentAt: new Date(consent),
      });
      return;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      await upsertSubscription(prisma, event.data.object as Stripe.Subscription);
      return;
    }
    default:
      return;
  }
}
