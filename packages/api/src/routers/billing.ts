/**
 * Checkout and subscription management. Payment itself happens on Stripe's
 * hosted pages, so no card data ever reaches this application.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import type { PrismaClient } from '@evenup/db';
import type Stripe from 'stripe';
import { router, protectedProcedure } from '../trpc.js';
import { getStripe } from '../billing/stripe.js';
import {
  creditPacks,
  packById,
  subscriptionPriceId,
  currencyForLocale,
  isBillingEnabled,
  TRIAL_PERIOD_DAYS,
} from '../billing/prices.js';
import { receiptRetentionDays } from '../config/retention.js';

function returnUrl(path: string): string {
  const base = process.env.BILLING_RETURN_URL ?? 'http://localhost:3000';
  return `${base}${path}`;
}

function requireStripe() {
  const stripe = getStripe();
  if (!stripe) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Billing is not configured on this instance.',
    });
  }
  return stripe;
}

/**
 * Persist a freshly-minted Stripe customer id, first-writer-wins. Two
 * concurrent first purchases can both read a null `stripeCustomerId` and
 * both create a Stripe customer; the conditional `updateMany` (only write
 * when the column is still null — same pattern as `reserveCredit` in
 * billing/ledger.ts) makes exactly one of those writes stick. The loser's
 * freshly-created Stripe customer is orphaned (acceptable — not worth
 * distributed-locking), but re-reading the row means the loser still
 * returns the same, canonical id that's actually in the database.
 */
export async function persistCustomerId(
  prisma: PrismaClient,
  userId: string,
  customerId: string,
): Promise<string> {
  const { count } = await prisma.user.updateMany({
    where: { id: userId, stripeCustomerId: null },
    data: { stripeCustomerId: customerId },
  });
  if (count === 1) return customerId;
  const winner = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { stripeCustomerId: true },
  });
  if (!winner.stripeCustomerId) {
    // Unreachable in practice: count === 0 means either the id doesn't
    // exist (impossible — the caller just read it) or another writer set
    // stripeCustomerId first, so it can't be null here.
    throw new Error('persistCustomerId: lost the race but no stripeCustomerId was persisted');
  }
  return winner.stripeCustomerId;
}

/** Reuse the user's Stripe customer, creating one on first purchase. */
async function customerIdFor(ctx: {
  prisma: PrismaClient;
  user: { id: string; email: string };
}): Promise<string> {
  const stripe = requireStripe();
  const existing = await ctx.prisma.user.findUniqueOrThrow({
    where: { id: ctx.user.id },
    select: { stripeCustomerId: true },
  });
  if (existing.stripeCustomerId) return existing.stripeCustomerId;
  const customer = await stripe.customers.create({
    email: ctx.user.email,
    metadata: { userId: ctx.user.id },
  });
  return persistCustomerId(ctx.prisma, ctx.user.id, customer.id);
}

/**
 * Pure session params for the VIP subscription checkout. Extracted so the
 * Stripe metadata wiring is unit-testable without a network call.
 *
 * Stripe does NOT copy Checkout Session-level `metadata` onto the
 * Subscription object it creates for a `mode: 'subscription'` session —
 * only `subscription_data.metadata` propagates there. Task 8's webhook
 * reads `sub.metadata?.userId` off `customer.subscription.*` events, so
 * without this, that's always undefined in production and no Subscription
 * row is ever persisted (VIP silently never activates). Session-level
 * metadata is kept too — harmless, useful for reconciliation.
 */
export function buildSubscriptionCheckoutParams(args: {
  customerId: string;
  priceId: string;
  userId: string;
  successUrl: string;
  cancelUrl: string;
  /**
   * Length of the free trial to open the subscription with, or `undefined` for
   * no trial. The caller decides eligibility (see `hasEverSubscribed`); this
   * function only translates the answer into Stripe's shape.
   */
  trialPeriodDays?: number;
}): Stripe.Checkout.SessionCreateParams {
  return {
    mode: 'subscription',
    customer: args.customerId,
    line_items: [{ price: args.priceId, quantity: 1 }],
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    metadata: { userId: args.userId },
    subscription_data: {
      metadata: { userId: args.userId },
      // Spread-in rather than a literal `trial_period_days: args.trialPeriodDays`
      // because Stripe rejects a zero and a null here — the field has to be
      // absent for a returning subscriber, not present and falsy.
      //
      // And note this EXTENDS `subscription_data`; the `metadata` above is
      // load-bearing (see this function's header). Replacing the object to add
      // a trial would take the userId with it, and the webhook would then
      // never persist a Subscription row at all.
      ...(args.trialPeriodDays === undefined ? {} : { trial_period_days: args.trialPeriodDays }),
    },
  };
}

/** Pure session params for a one-off credit-pack checkout. */
export function buildCreditCheckoutParams(args: {
  customerId: string;
  priceId: string;
  userId: string;
  scans: number;
  withdrawalConsentAt: Date;
  successUrl: string;
  cancelUrl: string;
}): Stripe.Checkout.SessionCreateParams {
  return {
    mode: 'payment',
    customer: args.customerId,
    line_items: [{ price: args.priceId, quantity: 1 }],
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    metadata: {
      userId: args.userId,
      scans: String(args.scans),
      withdrawalConsent: args.withdrawalConsentAt.toISOString(),
    },
  };
}

/**
 * Terminal Stripe subscription statuses — the only two that mean "gone, sell
 * them another one". Everything else counts as an open subscription.
 *
 * Why any of this exists: `summary` used to look for `'active'` alone, which
 * quietly broke the moment a card expired. Stripe moves the subscription to
 * `past_due`, the app saw no subscription, and offered "Subscribe to VIP" to
 * somebody who already had one — and if Stripe's smart retries then recovered
 * the first, the customer was billed twice for the same product.
 *
 * Deliberately a deny-list. The allow-list this replaced omitted `paused`, so
 * a paused subscriber was offered a second subscription — the very bug this
 * guard exists to prevent, reintroduced by a status nobody enumerated. A
 * deny-list fails closed: a status Stripe adds later is treated as open, which
 * at worst blocks a sale until someone looks, rather than silently
 * double-charging a customer.
 */
export const TERMINAL_SUBSCRIPTION_STATUSES = ['canceled', 'incomplete_expired'] as const;

/**
 * The user's current subscription, if they have one in any non-terminal
 * state. Shared by `summary` (which decides what the UI offers) and
 * `checkoutSubscription` (which refuses to sell a second one), so the two can
 * never disagree about what counts as "already subscribed".
 */
async function openSubscription(prisma: PrismaClient, userId: string) {
  return prisma.subscription.findFirst({
    where: { userId, status: { notIn: [...TERMINAL_SUBSCRIPTION_STATUSES] } },
    orderBy: { currentPeriodEnd: 'desc' },
    select: { status: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
  });
}

/**
 * Whether this user has *ever* had a subscription — the free trial is offered
 * once, and only to someone who never has.
 *
 * **Read this next to `openSubscription` above, because the two look alike and
 * are not.** `openSubscription` asks "do they have a subscription right now?"
 * and deliberately excludes `TERMINAL_SUBSCRIPTION_STATUSES`, so a customer
 * who cancelled can buy again. This asks "did one ever exist?" and counts
 * those terminal rows, so the customer who cancelled buys again *without* a
 * second free week. Reusing `openSubscription` here would make
 * cancel-and-resubscribe an unlimited free ride: Stripe enforces no
 * one-trial-per-customer rule of its own, and `trial_period_days` is granted
 * on every session that asks for it.
 *
 * Scoped to the app's user id, which is the only identity this query has.
 * Account deletion nulls `Subscription.userId` (accounting retention vs.
 * erasure — see `services/account.ts`), so deleting the account and
 * registering again does reset eligibility. That is a deliberate limit, not an
 * oversight: closing it would mean matching on a Stripe customer that erasure
 * has already detached.
 */
async function hasEverSubscribed(prisma: PrismaClient, userId: string): Promise<boolean> {
  return (await prisma.subscription.count({ where: { userId } })) > 0;
}

export const billingRouter = router({
  /** Everything the pricing UI needs in one call. */
  summary: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { id: ctx.user.id },
      select: { creditBalance: true, isVip: true },
    });
    const subscription = await openSubscription(ctx.prisma, ctx.user.id);
    const currency = currencyForLocale(ctx.locale);
    return {
      billingEnabled: isBillingEnabled(),
      creditBalance: user.creditBalance,
      isVip: user.isVip,
      subscription,
      currency,
      /**
       * Whether this user would get the free trial if they subscribed now, so
       * the panel can offer "Try 7 days free" to a first-time subscriber and
       * the plain subscribe label to a returning one. Reported rather than
       * inferred client-side: `subscription` is null for both a never-yet
       * subscriber and a customer who cancelled, so the client cannot tell
       * them apart, and this is the same predicate `checkoutSubscription`
       * applies — the button cannot promise a trial checkout will not grant.
       */
      trialEligible: !(await hasEverSubscribed(ctx.prisma, ctx.user.id)),
      /** Days of free trial a first-time subscriber gets; copy interpolates it. */
      trialDays: TRIAL_PERIOD_DAYS,
      /**
       * Whether a subscription can actually be *bought* right now, in this
       * request's currency. `billingEnabled` only reports that
       * `STRIPE_SECRET_KEY` is set, but the VIP price is a separate variable
       * per currency (`STRIPE_PRICE_{CZK,EUR}_VIP`). With the key set and the
       * EUR price missing, the Subscribe button rendered for every English
       * user and every click failed with PRECONDITION_FAILED. The UI hides
       * the button when this is false, which is a real possibility on a
       * partially-configured instance rather than a theoretical one.
       */
      subscriptionAvailable: isBillingEnabled() && subscriptionPriceId(currency) !== null,
      packs: isBillingEnabled() ? creditPacks(currency) : [],
      /**
       * How long a stored receipt photo survives. Part of the pricing summary
       * because photo storage is what the subscription sells, and the panel
       * advertises it: the terms already quote this number, and the VIP panel
       * quoting a different one — or none, as it used to — is the kind of
       * mismatch a customer reads as a broken promise. Same source as the
       * cleanup job and the legal pages (`config/retention.ts`).
       */
      receiptRetentionDays: receiptRetentionDays(),
    };
  }),

  checkoutSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    const stripe = requireStripe();
    const currency = currencyForLocale(ctx.locale);
    const price = subscriptionPriceId(currency);
    if (!price) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Billing is not configured on this instance.',
      });
    }
    // Server-side, because the client cannot fix this: the UI's `pending`
    // flag only guards one page load, so two open tabs — or a stale tab left
    // open while the subscription went `past_due` in another — could each
    // open their own Stripe Checkout and end with two live subscriptions on
    // one customer. The portal is where an existing subscription is fixed,
    // renewed or cancelled; checkout is not.
    if (await openSubscription(ctx.prisma, ctx.user.id)) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'You already have a subscription; manage it in the billing portal.',
      });
    }
    // The free trial, once per customer. Checked server-side against every
    // Subscription row this user has ever had — including the terminal ones
    // the guard above ignores — because Stripe grants `trial_period_days` to
    // any session that asks, so cancel-and-resubscribe would otherwise be free
    // forever. See `hasEverSubscribed` for why it is not `openSubscription`.
    const trialPeriodDays = (await hasEverSubscribed(ctx.prisma, ctx.user.id))
      ? undefined
      : TRIAL_PERIOD_DAYS;
    const session = await stripe.checkout.sessions.create(
      buildSubscriptionCheckoutParams({
        customerId: await customerIdFor(ctx),
        priceId: price,
        userId: ctx.user.id,
        successUrl: returnUrl('/vip?checkout=success'),
        cancelUrl: returnUrl('/vip?checkout=cancelled'),
        trialPeriodDays,
      }),
    );
    return { url: session.url };
  }),

  checkoutCredits: protectedProcedure
    .input(z.object({ packId: z.string(), acknowledgeImmediate: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const stripe = requireStripe();
      // EU distance selling: credits are consumed immediately, so the customer
      // must expressly consent to immediate performance and acknowledge losing
      // the 14-day withdrawal right. Without this the purchase is refundable
      // even after the credits are spent.
      if (!input.acknowledgeImmediate) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Acknowledge immediate delivery to continue.',
        });
      }
      const currency = currencyForLocale(ctx.locale);
      const pack = packById(currency, input.packId);
      if (!pack) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown credit pack.' });
      }
      const session = await stripe.checkout.sessions.create(
        buildCreditCheckoutParams({
          customerId: await customerIdFor(ctx),
          priceId: pack.priceId,
          userId: ctx.user.id,
          scans: pack.scans,
          withdrawalConsentAt: new Date(),
          successUrl: returnUrl('/vip?checkout=success'),
          cancelUrl: returnUrl('/vip?checkout=cancelled'),
        }),
      );
      return { url: session.url };
    }),

  /** Stripe's hosted portal handles cancellation and card updates. */
  portal: protectedProcedure.mutation(async ({ ctx }) => {
    const stripe = requireStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: await customerIdFor(ctx),
      return_url: returnUrl('/vip'),
    });
    return { url: session.url };
  }),
});
