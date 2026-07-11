/**
 * Currencies offered in the pickers (new-group base currency, per-expense
 * currency). `@evenup/core` accepts any ISO 4217 code for the actual math; this
 * is just a curated shortlist for the dropdowns — the majors plus the
 * currencies common to this app's (largely Central-European) users, so e.g.
 * HUF, CHF or RON are one tap away instead of unavailable.
 */
export const COMMON_CURRENCIES = [
  'CZK',
  'EUR',
  'USD',
  'GBP',
  'PLN',
  'HUF',
  'CHF',
  'SEK',
  'NOK',
  'DKK',
  'RON',
  'BGN',
  'UAH',
  'CAD',
  'AUD',
  'JPY',
] as const;

export type CommonCurrency = (typeof COMMON_CURRENCIES)[number];
