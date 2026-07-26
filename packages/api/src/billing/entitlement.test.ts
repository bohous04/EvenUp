/** Entitlement decisions: the single source of truth for who may scan. */
import { describe, expect, it } from 'vitest';
import { resolveScanEntitlement, VIP_SCANS_PER_PERIOD } from './entitlement.js';

const now = new Date('2026-07-15T12:00:00Z');
const activeSub = {
  status: 'active',
  currentPeriodStart: new Date('2026-07-01T00:00:00Z'),
  currentPeriodEnd: new Date('2026-08-01T00:00:00Z'),
};
const base = {
  billingEnabled: true,
  isVip: false,
  creditBalance: 0,
  subscription: null,
  vipScansUsedThisPeriod: 0,
  now,
};

/**
 * `toEqual`, never `toMatchObject`, throughout this file.
 *
 * `toMatchObject` is why the receipt-photo rule shipped undecided: every case
 * below asserted `allow` and `consume` and simply omitted `mayStoreImage`, so
 * the value the function actually returned for a subscriber past the cap was
 * never checked by anything. An exact-shape assertion makes every field of
 * every branch load-bearing.
 */
describe('resolveScanEntitlement', () => {
  it('allows everything when billing is disabled (self-hosting)', () => {
    expect(resolveScanEntitlement({ ...base, billingEnabled: false })).toEqual({
      allow: true,
      consume: 'NONE',
      mayStoreImage: true,
    });
  });

  it('allows comped VIPs without consuming anything', () => {
    expect(resolveScanEntitlement({ ...base, isVip: true })).toEqual({
      allow: true,
      consume: 'NONE',
      mayStoreImage: true,
    });
  });

  it('stores the image for a comped VIP who also holds credits', () => {
    // The comp flag short-circuits before the credit branch; a balance must
    // not turn a comped scan into an unstored one.
    expect(resolveScanEntitlement({ ...base, isVip: true, creditBalance: 5 })).toEqual({
      allow: true,
      consume: 'NONE',
      mayStoreImage: true,
    });
  });

  it('consumes a VIP scan for an active subscriber under the cap', () => {
    expect(resolveScanEntitlement({ ...base, subscription: activeSub })).toEqual({
      allow: true,
      consume: 'VIP_SCAN',
      mayStoreImage: true,
    });
  });

  it('falls through to credits once the cap is reached, and keeps storing the photo', () => {
    // The product decision: photo storage follows the subscription, not the
    // funding bucket. Scan 151 of a subscriber's month is still a subscriber's
    // scan, and the terms sell photo storage as part of the subscription.
    expect(
      resolveScanEntitlement({
        ...base,
        subscription: activeSub,
        vipScansUsedThisPeriod: VIP_SCANS_PER_PERIOD,
        creditBalance: 3,
      }),
    ).toEqual({ allow: true, consume: 'CREDIT', mayStoreImage: true });
  });

  it('refuses at the cap with no credits', () => {
    expect(
      resolveScanEntitlement({
        ...base,
        subscription: activeSub,
        vipScansUsedThisPeriod: VIP_SCANS_PER_PERIOD,
      }),
    ).toEqual({ allow: false, mayStoreImage: false, reason: 'NO_ENTITLEMENT' });
  });

  it('ignores a subscription that is not active, and stores no photo for it', () => {
    // `past_due` is not a usable subscription, so the scan is funded by a
    // credit *and* unstored — the non-subscriber rule, correctly applied to
    // someone whose subscription has lapsed.
    expect(
      resolveScanEntitlement({
        ...base,
        subscription: { ...activeSub, status: 'past_due' },
        creditBalance: 1,
      }),
    ).toEqual({ allow: true, consume: 'CREDIT', mayStoreImage: false });
  });

  it('ignores a subscription whose period has ended', () => {
    expect(
      resolveScanEntitlement({
        ...base,
        subscription: { ...activeSub, currentPeriodEnd: new Date('2026-07-10T00:00:00Z') },
      }),
    ).toEqual({ allow: false, mayStoreImage: false, reason: 'NO_ENTITLEMENT' });
  });

  it('stores no photo for a credit scan on a subscription whose period has ended', () => {
    expect(
      resolveScanEntitlement({
        ...base,
        subscription: { ...activeSub, currentPeriodEnd: new Date('2026-07-10T00:00:00Z') },
        creditBalance: 2,
      }),
    ).toEqual({ allow: true, consume: 'CREDIT', mayStoreImage: false });
  });

  it('stores no photo for a credit scan whose subscription has not started yet', () => {
    expect(
      resolveScanEntitlement({
        ...base,
        subscription: { ...activeSub, currentPeriodStart: new Date('2026-07-20T00:00:00Z') },
        creditBalance: 2,
      }),
    ).toEqual({ allow: true, consume: 'CREDIT', mayStoreImage: false });
  });

  it('consumes a credit when there is no subscription, and stores no photo', () => {
    expect(resolveScanEntitlement({ ...base, creditBalance: 1 })).toEqual({
      allow: true,
      consume: 'CREDIT',
      mayStoreImage: false,
    });
  });

  it('refuses with no subscription and no credits', () => {
    expect(resolveScanEntitlement(base)).toEqual({
      allow: false,
      mayStoreImage: false,
      reason: 'NO_ENTITLEMENT',
    });
  });
});
