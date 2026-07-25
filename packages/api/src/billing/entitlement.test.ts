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

describe('resolveScanEntitlement', () => {
  it('allows everything when billing is disabled (self-hosting)', () => {
    const r = resolveScanEntitlement({ ...base, billingEnabled: false });
    expect(r).toMatchObject({ allow: true, consume: 'NONE', mayStoreImage: true });
  });

  it('allows comped VIPs without consuming anything', () => {
    const r = resolveScanEntitlement({ ...base, isVip: true });
    expect(r).toMatchObject({ allow: true, consume: 'NONE', mayStoreImage: true });
  });

  it('consumes a VIP scan for an active subscriber under the cap', () => {
    const r = resolveScanEntitlement({ ...base, subscription: activeSub });
    expect(r).toMatchObject({ allow: true, consume: 'VIP_SCAN', mayStoreImage: true });
  });

  it('falls through to credits once the cap is reached', () => {
    const r = resolveScanEntitlement({
      ...base,
      subscription: activeSub,
      vipScansUsedThisPeriod: VIP_SCANS_PER_PERIOD,
      creditBalance: 3,
    });
    expect(r).toMatchObject({ allow: true, consume: 'CREDIT' });
  });

  it('refuses at the cap with no credits', () => {
    const r = resolveScanEntitlement({
      ...base,
      subscription: activeSub,
      vipScansUsedThisPeriod: VIP_SCANS_PER_PERIOD,
    });
    expect(r).toMatchObject({ allow: false, reason: 'NO_ENTITLEMENT' });
  });

  it('ignores a subscription that is not active', () => {
    const r = resolveScanEntitlement({
      ...base,
      subscription: { ...activeSub, status: 'past_due' },
      creditBalance: 1,
    });
    expect(r).toMatchObject({ allow: true, consume: 'CREDIT' });
  });

  it('ignores a subscription whose period has ended', () => {
    const r = resolveScanEntitlement({
      ...base,
      subscription: { ...activeSub, currentPeriodEnd: new Date('2026-07-10T00:00:00Z') },
    });
    expect(r).toMatchObject({ allow: false });
  });

  it('consumes a credit when there is no subscription', () => {
    const r = resolveScanEntitlement({ ...base, creditBalance: 1 });
    expect(r).toMatchObject({ allow: true, consume: 'CREDIT' });
  });

  it('denies image storage to credit-funded scans', () => {
    const r = resolveScanEntitlement({ ...base, creditBalance: 1 });
    expect(r.mayStoreImage).toBe(false);
  });

  it('refuses with no subscription and no credits', () => {
    expect(resolveScanEntitlement(base)).toMatchObject({
      allow: false,
      reason: 'NO_ENTITLEMENT',
    });
  });
});
