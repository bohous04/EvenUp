/**
 * ⚠️ DISPLAYED prices — presentation only. NOTHING here is ever charged.
 *
 * `prices.ts` deliberately holds only Stripe *price ids*: the amount a customer
 * is actually charged lives in Stripe and is decided by Stripe at checkout, so
 * billing logic can never drift from it. That is the right rule, and this
 * module does not change it.
 *
 * But a public price list has to print a number before anyone reaches
 * checkout, and reading it back from the Stripe API would put a network call
 * (and a Stripe key — which a self-hosted instance does not have) on the
 * critical path of a static marketing page. So the amounts below are a local,
 * human-maintained copy of what is configured on the Stripe prices.
 *
 * **Nothing enforces that they agree.** When you change an amount on a Stripe
 * price, you MUST change it here in the same commit, and vice versa. If they
 * ever disagree, the customer is charged the Stripe amount, not this one.
 *
 * Amounts are integer minor units (5000 = 50,00 Kč) — the same convention as
 * every other amount in the codebase — and are rendered through
 * `formatCurrency` from `@evenup/i18n`, so no currency symbol is ever written
 * into copy.
 *
 * This module is imported by client components (the VIP pricing panel), so it
 * must stay free of runtime imports, `process.env`, and anything server-only.
 * The `BillingCurrency` import below is type-only and erases at compile time.
 */
import type { BillingCurrency } from './prices.js';

/** The VIP subscription, per month. */
export const VIP_MONTHLY_DISPLAY_MINOR: Readonly<Record<BillingCurrency, number>> = {
  CZK: 5000, // 50 Kč
  EUR: 200, // 2 €
};

/**
 * Pack sizes shown on the public price list, smallest (the 2-scan minimum)
 * first. Mirrors `PACK_SIZES` in `prices.ts`, which decides which packs are
 * actually *purchasable* — that one is filtered by which Stripe price ids are
 * configured, so it can be empty (self-hosting, no Stripe key) while the
 * public price list still has something to show.
 *
 * The two lists must hold the same *sizes*, and `display-prices.test.ts`
 * asserts exactly that, so a size added to `PACK_SIZES` cannot quietly go
 * missing here. Only the amounts stay independent.
 */
export const DISPLAY_PACK_SIZES = [2, 5, 10] as const;

/**
 * One-off scan packs, keyed by pack size. Mirrors `PACK_SIZES` in `prices.ts`
 * — a size configured there without an entry here would render without a
 * price, which `displayPackPriceMinor` surfaces as `undefined` rather than
 * inventing a number.
 */
export const PACK_DISPLAY_MINOR: Readonly<
  Record<BillingCurrency, Readonly<Record<number, number>>>
> = {
  CZK: {
    2: 2000, // 20 Kč
    5: 5000, // 50 Kč
    10: 10000, // 100 Kč
  },
  EUR: {
    2: 100, // 1 €
    5: 200, // 2 €
    10: 400, // 4 €
  },
};

/** Displayed monthly price of the VIP subscription, in minor units. */
export function displaySubscriptionPriceMinor(currency: BillingCurrency): number {
  return VIP_MONTHLY_DISPLAY_MINOR[currency];
}

/**
 * Displayed price of a scan pack, in minor units — `undefined` for a pack size
 * with no entry, so a caller renders no price rather than a wrong one.
 */
export function displayPackPriceMinor(
  currency: BillingCurrency,
  scans: number,
): number | undefined {
  return PACK_DISPLAY_MINOR[currency][scans];
}

export type { BillingCurrency };
