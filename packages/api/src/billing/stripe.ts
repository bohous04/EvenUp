/**
 * Stripe client factory. Returns null when unconfigured so every caller is
 * forced to handle the self-hosted case rather than crashing on boot.
 */
import Stripe from 'stripe';

let cached: Stripe | null | undefined;

export function getStripe(): Stripe | null {
  if (cached !== undefined) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  cached = key ? new Stripe(key) : null;
  return cached;
}

/** Test seam: forget the memoised client after changing env vars. */
export function resetStripeForTests(): void {
  cached = undefined;
}
