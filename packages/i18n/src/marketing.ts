/**
 * Translator for the marketing namespace.
 *
 * Deliberately separate from `t()`: the landing page's copy lives in its own
 * catalog (`locales/marketing.ts`) so it does not bloat the app catalogs, and
 * a separate catalog needs its own lookup — `t()`'s `MessageKey` is derived
 * from `cs.ts` and would reject these keys (which is the point: the two
 * namespaces cannot be confused for one another at the type level).
 *
 * Same semantics as `t()` otherwise: unknown locales fall back to Czech, a key
 * missing from a locale falls back to the Czech string, and unknown
 * placeholders are left intact so missing data is visible.
 */
import { marketingCs, marketingEn, type MarketingKey } from './locales/marketing.js';
import { interpolate, DEFAULT_LOCALE, type InterpolationValues } from './translate.js';
import type { Locale } from './format.js';

export const marketingCatalogs: Record<Locale, Record<MarketingKey, string>> = {
  cs: marketingCs,
  en: marketingEn,
};

/** Translate a marketing key for a locale, interpolating any placeholders. */
export function tMarketing(
  locale: Locale,
  key: MarketingKey,
  values: InterpolationValues = {},
): string {
  const catalog = marketingCatalogs[locale] ?? marketingCatalogs[DEFAULT_LOCALE];
  const template = catalog[key] ?? marketingCatalogs[DEFAULT_LOCALE][key];
  return interpolate(template, values);
}

/** Bind a locale to produce a `(key, values) => string` marketing translator. */
export function createMarketingTranslator(locale: Locale) {
  return (key: MarketingKey, values: InterpolationValues = {}): string =>
    tMarketing(locale, key, values);
}

export type { MarketingKey };
