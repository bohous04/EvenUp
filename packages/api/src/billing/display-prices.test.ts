import { describe, expect, it } from 'vitest';
import { formatCurrency } from '@evenup/i18n';
import {
  VIP_MONTHLY_DISPLAY_MINOR,
  PACK_DISPLAY_MINOR,
  DISPLAY_PACK_SIZES,
  displaySubscriptionPriceMinor,
  displayPackPriceMinor,
} from './display-prices.js';
import { PACK_SIZES } from './prices.js';

describe('display prices', () => {
  it('advertises exactly the pack sizes production can sell', () => {
    // The *amounts* are duplicated on purpose (see display-prices.ts) and are
    // asserted literally below, so they cannot drift together silently. The
    // set of *sizes* is a different matter: adding one to `PACK_SIZES` without
    // adding it here would drop it off the public price list without a word.
    expect(new Set(DISPLAY_PACK_SIZES)).toEqual(new Set(PACK_SIZES));
  });

  it('prices the VIP subscription in both billing currencies', () => {
    expect(displaySubscriptionPriceMinor('CZK')).toBe(5000);
    expect(displaySubscriptionPriceMinor('EUR')).toBe(200);
  });

  it('prices every pack size production can configure, in both currencies', () => {
    for (const currency of ['CZK', 'EUR'] as const) {
      for (const scans of PACK_SIZES) {
        expect(displayPackPriceMinor(currency, scans), `${currency}/${scans}`).toBeGreaterThan(0);
      }
    }
    expect(displayPackPriceMinor('CZK', 2)).toBe(2000);
    expect(displayPackPriceMinor('CZK', 5)).toBe(5000);
    expect(displayPackPriceMinor('CZK', 10)).toBe(10000);
    expect(displayPackPriceMinor('EUR', 2)).toBe(100);
    expect(displayPackPriceMinor('EUR', 5)).toBe(200);
    expect(displayPackPriceMinor('EUR', 10)).toBe(400);
  });

  it('returns undefined for an unpriced pack size rather than inventing one', () => {
    expect(displayPackPriceMinor('CZK', 7)).toBeUndefined();
  });

  it('gets cheaper per scan as the pack grows, in every currency', () => {
    for (const currency of ['CZK', 'EUR'] as const) {
      const perScan = PACK_SIZES.map((s) => PACK_DISPLAY_MINOR[currency][s]! / s);
      for (let i = 1; i < perScan.length; i += 1) {
        expect(perScan[i], `${currency} pack of ${PACK_SIZES[i]}`).toBeLessThanOrEqual(
          perScan[i - 1]!,
        );
      }
    }
  });

  it('keeps the smallest pack at the 2-scan minimum the product asks for', () => {
    expect(Math.min(...PACK_SIZES)).toBe(2);
    expect(PACK_DISPLAY_MINOR.CZK[2]).toBe(2000);
  });

  it('are integer minor units that render through the locale-aware formatter', () => {
    for (const amount of [
      ...Object.values(VIP_MONTHLY_DISPLAY_MINOR),
      ...Object.values(PACK_DISPLAY_MINOR).flatMap((p) => Object.values(p)),
    ]) {
      expect(Number.isInteger(amount)).toBe(true);
    }
    expect(formatCurrency(displaySubscriptionPriceMinor('CZK'), 'CZK', 'cs')).toContain('Kč');
    expect(formatCurrency(displaySubscriptionPriceMinor('EUR'), 'EUR', 'en')).toContain('2');
  });
});
