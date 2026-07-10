/**
 * Locale-aware number, currency, and date formatting. (FR-10.3)
 *
 * Currency amounts come in as integer minor units; we scale them to major units
 * using the currency's exponent from `@evenup/core` and hand off to `Intl`.
 */
import { currencyExponent, type CurrencyCode } from '@evenup/core';

export type Locale = 'cs' | 'en';

const INTL_LOCALE: Record<Locale, string> = {
  cs: 'cs-CZ',
  en: 'en-US',
};

/** Format integer minor units as a localized currency string (e.g. `1 234,50 Kč`). */
export function formatCurrency(minorUnits: number, currency: CurrencyCode, locale: Locale): string {
  const exp = currencyExponent(currency);
  const major = minorUnits / 10 ** exp;
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: exp,
    maximumFractionDigits: exp,
  }).format(major);
}

/** Format a number for the locale. */
export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale]).format(value);
}

/**
 * The CLDR plural category (`one` / `few` / `many` / `other`) for `count` in the
 * locale — Czech uses `one` (1), `few` (2–4), `other` (0, 5+); English `one`/`other`.
 */
export function pluralCategory(count: number, locale: Locale): Intl.LDMLPluralRule {
  return new Intl.PluralRules(INTL_LOCALE[locale]).select(count);
}

/** Format an ISO date string or `Date` for the locale (medium style). */
export function formatDate(date: string | Date, locale: Locale): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) {
    throw new TypeError(`Invalid date: ${String(date)}`);
  }
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d);
}
