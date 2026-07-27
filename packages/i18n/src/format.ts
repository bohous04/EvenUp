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

export interface FormatCurrencyOptions {
  /**
   * Drop the fraction on an amount that lands exactly on a whole unit, so a
   * price list reads "50 Kč" / "€2" rather than "50,00 Kč" / "€2.00".
   *
   * Opt-in, and only for *prices* — a ledger amount must keep its minor units
   * so a column of figures stays aligned and 50 is never confused with 50,00.
   *
   * The trim is all-or-nothing per amount: either both fraction digits print
   * or neither does. Setting `minimumFractionDigits: 0` with
   * `maximumFractionDigits: exp` instead would render 1234.50 as "1 234,5 Kč",
   * which is not how money is written.
   */
  readonly trimZeroFraction?: boolean;
}

/**
 * Format integer minor units as a localized currency string (e.g. `1 234,50 Kč`).
 *
 * The fraction-digit count is handed to `Intl` rather than trimmed off the
 * formatted string afterwards: Czech puts the symbol last (`50,00 Kč`) and
 * English first (`€2.00`), so only `Intl` places it correctly in both.
 */
/**
 * The `FormatCurrencyOptions` a *price list* uses — round numbers like
 * "50 Kč" / "€2" rather than ledger amounts like "50,00 Kč" / "€2.00".
 *
 * Shared by the public landing page (`app/[locale]/(marketing)/page.tsx`) and
 * the in-app VIP panel (`components/vip-pricing.tsx`), which price the exact
 * same figures and must render them identically — a duplicated literal in
 * each file would let the two silently drift.
 */
export const TRIMMED_PRICE_FORMAT: FormatCurrencyOptions = { trimZeroFraction: true };

export function formatCurrency(
  minorUnits: number,
  currency: CurrencyCode,
  locale: Locale,
  options: FormatCurrencyOptions = {},
): string {
  const exp = currencyExponent(currency);
  const major = minorUnits / 10 ** exp;
  const isWhole = minorUnits % 10 ** exp === 0;
  const digits = options.trimZeroFraction && isWhole ? 0 : exp;
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(major);
}

/** Format a number for the locale. */
export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale]).format(value);
}

/**
 * `Intl.PluralRules` is absent from Hermes (React Native) even though
 * `Intl.NumberFormat`/`DateTimeFormat` are present, so calling it there throws
 * "Cannot read property 'prototype' of undefined". Probed once at module load.
 */
const hasIntlPluralRules = typeof Intl !== 'undefined' && typeof Intl.PluralRules === 'function';

/**
 * CLDR plural rules for the two locales we ship, for engines without
 * `Intl.PluralRules`. Mirrors the CLDR spec exactly:
 * `i` = integer digits, `v` = number of visible fraction digits.
 */
function pluralCategoryFallback(count: number, locale: Locale): Intl.LDMLPluralRule {
  const hasFraction = !Number.isInteger(count);
  const i = Math.abs(Math.trunc(count));

  if (locale === 'en') {
    // en: one → i = 1 and v = 0; otherwise other.
    return i === 1 && !hasFraction ? 'one' : 'other';
  }
  // cs: one → i = 1, v = 0 · few → i = 2..4, v = 0 · many → v ≠ 0 · other → rest.
  if (hasFraction) return 'many';
  if (i === 1) return 'one';
  if (i >= 2 && i <= 4) return 'few';
  return 'other';
}

/**
 * The CLDR plural category (`one` / `few` / `many` / `other`) for `count` in the
 * locale — Czech uses `one` (1), `few` (2–4), `other` (0, 5+); English `one`/`other`.
 */
export function pluralCategory(count: number, locale: Locale): Intl.LDMLPluralRule {
  if (!hasIntlPluralRules) return pluralCategoryFallback(count, locale);
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
