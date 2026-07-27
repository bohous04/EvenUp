/**
 * Price catalogue. Everything is read from configuration so prices can be
 * retuned without a deploy; nothing here hardcodes an amount. Amounts live in
 * Stripe — this module only maps our product ids to Stripe price ids.
 */

export type BillingCurrency = 'CZK' | 'EUR';

export interface CreditPack {
  /** Stable identifier used by the client to request a checkout session. */
  readonly id: string;
  readonly scans: number;
  readonly priceId: string;
}

/** Czech pages are priced in CZK, everything else in EUR. */
export function currencyForLocale(locale: string): BillingCurrency {
  return locale === 'en' ? 'EUR' : 'CZK';
}

/** Billing is inert — and self-hosting therefore unaffected — without this. */
export function isBillingEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function subscriptionPriceId(currency: BillingCurrency): string | null {
  return process.env[`STRIPE_PRICE_${currency}_VIP`] ?? null;
}

/**
 * Length of the free trial a first-time VIP subscriber is offered, in days.
 *
 * A commercial term rather than a Stripe price id, so it lives here with the
 * rest of the offer and is the single number the copy interpolates: the
 * landing page, the VIP panel, the terms and the withdrawal document all read
 * it, so none of them can advertise a trial length checkout does not create.
 *
 * Not configurable per instance on purpose. The value shows up in consumer
 * copy in two locales, and one of the Czech strings (`vip.trial.subscribe`)
 * uses a genitive plural that is correct for 5 and above but not for 2–4 — see
 * the comment beside it. Changing this constant means checking that string.
 */
export const TRIAL_PERIOD_DAYS = 7;

/**
 * The pack sizes production can sell, smallest first. Exported so
 * `display-prices.ts`'s public price list can be *tested* against it: the two
 * lists are deliberately separate (amounts must not be inferred from what is
 * purchasable, and a self-hosted instance has neither), but the set of sizes
 * must not drift, or a new size would silently be missing a price on the
 * landing page.
 */
export const PACK_SIZES = [2, 5, 10] as const;

/** Packs with a configured price id, smallest first. */
export function creditPacks(currency: BillingCurrency): CreditPack[] {
  return PACK_SIZES.flatMap((scans) => {
    const priceId = process.env[`STRIPE_PRICE_${currency}_PACK_${scans}`];
    return priceId ? [{ id: `pack${scans}`, scans, priceId }] : [];
  });
}

export function packById(currency: BillingCurrency, id: string): CreditPack | undefined {
  return creditPacks(currency).find((p) => p.id === id);
}
