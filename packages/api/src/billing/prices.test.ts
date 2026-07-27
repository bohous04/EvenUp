import { afterEach, describe, expect, it } from 'vitest';
import { currencyForLocale, creditPacks, packById, isBillingEnabled } from './prices.js';

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe('prices', () => {
  it('maps locale to currency, defaulting to CZK', () => {
    expect(currencyForLocale('cs')).toBe('CZK');
    expect(currencyForLocale('en')).toBe('EUR');
    expect(currencyForLocale('zz')).toBe('CZK');
  });

  it('reports billing disabled without a secret key', () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(isBillingEnabled()).toBe(false);
  });

  it('exposes only packs that have a configured price id', () => {
    process.env.STRIPE_PRICE_CZK_PACK_5 = 'price_czk_5';
    delete process.env.STRIPE_PRICE_CZK_PACK_2;
    delete process.env.STRIPE_PRICE_CZK_PACK_10;
    const packs = creditPacks('CZK');
    expect(packs.map((p) => p.id)).toEqual(['pack5']);
    expect(packs[0]).toMatchObject({ scans: 5, priceId: 'price_czk_5' });
  });

  it('looks a pack up by id', () => {
    process.env.STRIPE_PRICE_EUR_PACK_10 = 'price_eur_10';
    expect(packById('EUR', 'pack10')?.scans).toBe(10);
    expect(packById('EUR', 'nope')).toBeUndefined();
  });
});
