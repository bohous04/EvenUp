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

const PACK_SIZES = [2, 5, 10] as const;

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
