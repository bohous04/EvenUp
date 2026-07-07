/**
 * Message lookup and `{placeholder}` interpolation. (FR-10.4)
 *
 * All user-facing strings come from the catalogs; unknown locales fall back to
 * the default (Czech), and unknown placeholders are left intact so missing data
 * is visible rather than silently dropped.
 */
import { cs, type MessageKey } from './locales/cs.js';
import { en } from './locales/en.js';
import type { Locale } from './format.js';

export const DEFAULT_LOCALE: Locale = 'cs';
export const LOCALES = ['cs', 'en'] as const;

export const catalogs: Record<Locale, Record<MessageKey, string>> = { cs, en };

export type InterpolationValues = Record<string, string | number>;

function interpolate(template: string, values: InterpolationValues): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

/** Translate a key for a locale, interpolating any placeholders. */
export function t(locale: Locale, key: MessageKey, values: InterpolationValues = {}): string {
  const catalog = catalogs[locale] ?? catalogs[DEFAULT_LOCALE];
  const template = catalog[key] ?? catalogs[DEFAULT_LOCALE][key];
  return interpolate(template, values);
}

/** Bind a locale to produce a `(key, values) => string` translator. */
export function createTranslator(locale: Locale) {
  return (key: MessageKey, values: InterpolationValues = {}): string => t(locale, key, values);
}

export type { MessageKey };
