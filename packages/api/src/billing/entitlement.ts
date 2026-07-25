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
  /** Receipt images are retained for subscribers and comped users only. */
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

function isSubscriptionUsable(sub: EntitlementInput['subscription'], now: Date): boolean {
  if (!sub) return false;
  if (sub.status !== 'active') return false;
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
  if (input.creditBalance > 0) {
    return { allow: true, consume: 'CREDIT', mayStoreImage: false };
  }

  return DENIED;
}
