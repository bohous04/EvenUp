import { describe, it, expect } from 'vitest';
import { isSupportedCurrency } from '@evenup/core';
import { COMMON_CURRENCIES } from './currencies';

describe('COMMON_CURRENCIES', () => {
  it('offers HUF alongside the previous defaults', () => {
    for (const code of ['CZK', 'EUR', 'USD', 'GBP', 'PLN', 'HUF']) {
      expect(COMMON_CURRENCIES).toContain(code);
    }
  });

  it('contains only well-formed ISO 4217 codes', () => {
    for (const code of COMMON_CURRENCIES) {
      expect(isSupportedCurrency(code)).toBe(true);
    }
  });

  it('has no duplicates', () => {
    expect(new Set(COMMON_CURRENCIES).size).toBe(COMMON_CURRENCIES.length);
  });
});
