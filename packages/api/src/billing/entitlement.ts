/**
 * Who may scan a receipt, and what it costs them. Pure — no I/O — so the whole
 * decision matrix is unit-testable. Every caller must go through this; nothing
 * else should read `isVip` or `creditBalance` to make an access decision.
 */

/** Scans included in a subscription period. Beyond this, credits are used. */
export const VIP_SCANS_PER_PERIOD = 150;

export type Consume = 'NONE' | 'VIP_SCAN' | 'CREDIT';

export interface Entitlement {
  readonly allow: boolean;
  readonly consume?: Consume;
  /**
   * Whether this scan's photo may be stored.
   *
   * **Storage follows the subscription, not the funding bucket.** An active
   * subscriber (or a comp `isVip`, or an unmetered self-hosted instance) gets
   * `true` for every scan, including the ones paid from credits after the
   * {@link VIP_SCANS_PER_PERIOD} allowance runs out. A non-subscriber spending
   * credits gets `false`.
   *
   * The alternative — keying it on `consume` — silently withdrew a paid
   * benefit mid-period: scan 151 of a subscriber's month stopped storing the
   * photo they are still paying to have stored. See the "Receipt-image
   * storage" section of the billing spec, where this resolved a contradiction
   * in the original wording.
   */
  readonly mayStoreImage: boolean;
  readonly reason?: 'NO_ENTITLEMENT';
}

export interface EntitlementInput {
  /** False when STRIPE_SECRET_KEY is unset — i.e. a self-hosted instance. */
  readonly billingEnabled: boolean;
  /** The comp override: free, uncapped, no Stripe involvement. */
  readonly isVip: boolean;
  readonly creditBalance: number;
  readonly subscription: {
    readonly status: string;
    readonly currentPeriodStart: Date;
    readonly currentPeriodEnd: Date;
  } | null;
  readonly vipScansUsedThisPeriod: number;
  readonly now: Date;
}

const DENIED: Entitlement = { allow: false, mayStoreImage: false, reason: 'NO_ENTITLEMENT' };

/**
 * Stripe subscription statuses that entitle the customer to VIP *right now*.
 *
 * `trialing` is here for a concrete reason, not for completeness: Stripe puts
 * a subscription created with `trial_period_days` (see
 * `buildSubscriptionCheckoutParams` in `routers/billing.ts`) into `trialing`
 * until the first invoice is paid, and this function used to require
 * `status === 'active'` alone. That combination grants a customer on the 7-day
 * free trial exactly zero scans: checkout succeeds, the panel says VIP, and
 * the first scan is refused. The whole trial feature is inert without this
 * line.
 *
 * A trial gets the full experience — the same {@link VIP_SCANS_PER_PERIOD}
 * allowance and the same `mayStoreImage: true` — because that is what is being
 * trialled.
 *
 * Deliberately an allow-list, unlike `TERMINAL_SUBSCRIPTION_STATUSES` in
 * `routers/billing.ts`, which is a deny-list. The two answer opposite
 * questions and must fail in opposite directions: "may this person scan?"
 * fails closed by denying an unrecognised status, while "does this person
 * already have a subscription?" fails closed by treating an unrecognised
 * status as one they have. A status Stripe adds later is refused here (they
 * scan once we look at it) rather than silently granted.
 */
const USABLE_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set(['active', 'trialing']);

function isSubscriptionUsable(sub: EntitlementInput['subscription'], now: Date): boolean {
  if (!sub) return false;
  if (!USABLE_SUBSCRIPTION_STATUSES.has(sub.status)) return false;
  // Still bounded by the period window. While trialing, Stripe sets the
  // subscription item's `current_period_start/end` to the trial window (the
  // webhook copies exactly those onto the row), so a trial that lapsed without
  // converting falls out of the window here and stops being usable.
  return sub.currentPeriodStart <= now && now < sub.currentPeriodEnd;
}

export function resolveScanEntitlement(input: EntitlementInput): Entitlement {
  // 1. Self-hosting: no billing configured, so nothing is metered.
  if (!input.billingEnabled) return { allow: true, consume: 'NONE', mayStoreImage: true };

  // 2. Comp override — testers, friends, the operator.
  if (input.isVip) return { allow: true, consume: 'NONE', mayStoreImage: true };

  // 3. Subscription allowance.
  if (
    isSubscriptionUsable(input.subscription, input.now) &&
    input.vipScansUsedThisPeriod < VIP_SCANS_PER_PERIOD
  ) {
    return { allow: true, consume: 'VIP_SCAN', mayStoreImage: true };
  }

  // 4. Prepaid credits. Reaching here from step 3 *is* the "fall back to
  //    credits at the cap" behaviour; it needs no special case.
  //
  //    `mayStoreImage` is re-derived from the subscription rather than set to
  //    a constant `false`: a subscriber who has exhausted the allowance is
  //    still a subscriber, and photo storage is what the subscription sells.
  if (input.creditBalance > 0) {
    return {
      allow: true,
      consume: 'CREDIT',
      mayStoreImage: isSubscriptionUsable(input.subscription, input.now),
    };
  }

  return DENIED;
}
