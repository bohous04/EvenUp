/**
 * Checkout and subscription management. Payment itself happens on Stripe's
 * hosted pages, so no card data ever reaches this application.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import type { PrismaClient } from '@evenup/db';
import { router, protectedProcedure } from '../trpc.js';
import { getStripe } from '../billing/stripe.js';
import {
  creditPacks,
  packById,
  subscriptionPriceId,
  currencyForLocale,
  isBillingEnabled,
} from '../billing/prices.js';

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
  await ctx.prisma.user.update({
    where: { id: ctx.user.id },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

export const billingRouter = router({
  /** Everything the pricing UI needs in one call. */
  summary: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { id: ctx.user.id },
      select: { creditBalance: true, isVip: true },
    });
    const subscription = await ctx.prisma.subscription.findFirst({
      where: { userId: ctx.user.id, status: 'active' },
      orderBy: { currentPeriodEnd: 'desc' },
      select: { status: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
    });
    const currency = currencyForLocale(ctx.locale);
    return {
      billingEnabled: isBillingEnabled(),
      creditBalance: user.creditBalance,
      isVip: user.isVip,
      subscription,
      currency,
      packs: isBillingEnabled() ? creditPacks(currency) : [],
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
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: await customerIdFor(ctx),
      line_items: [{ price, quantity: 1 }],
      success_url: returnUrl('/vip?checkout=success'),
      cancel_url: returnUrl('/vip?checkout=cancelled'),
      metadata: { userId: ctx.user.id },
    });
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
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer: await customerIdFor(ctx),
        line_items: [{ price: pack.priceId, quantity: 1 }],
        success_url: returnUrl('/vip?checkout=success'),
        cancel_url: returnUrl('/vip?checkout=cancelled'),
        metadata: {
          userId: ctx.user.id,
          scans: String(pack.scans),
          withdrawalConsent: new Date().toISOString(),
        },
      });
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
