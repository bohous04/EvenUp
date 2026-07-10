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

/**
 * Join display names for a sentence. Up to `max` names are joined with
 * `Intl.ListFormat`; beyond that the list is truncated and the remainder is shown
 * as a `+N` chip.
 *
 * `disjunction` ("Petr nebo Jana") is an instruction — one of you pays.
 * `conjunction` ("Petr a Jana") is a statement of fact.
 *
 * The truncated branch joins with a plain `', '` on purpose. Czech
 * `Intl.ListFormat(type: 'unit')` renders `Petr, Jana a Filip`, inserting "a"
 * before the last visible name — which is wrong when the list continues — and
 * `style: 'narrow'` drops the commas entirely. No `Intl` list type produces a
 * correctly truncated list.
 */
export function formatNameList(
  names: readonly string[],
  locale: Locale,
  type: 'conjunction' | 'disjunction',
  max = 3,
): string {
  if (names.length <= max) {
    return new Intl.ListFormat(INTL_LOCALE[locale], { style: 'long', type }).format(names);
  }
  return `${names.slice(0, max).join(', ')} +${names.length - max}`;
}
