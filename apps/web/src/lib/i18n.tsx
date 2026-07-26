'use client';
import { createContext, useContext, useMemo } from 'react';
import {
  createTranslator,
  plural as pluralize,
  formatCurrency as fmtCurrency,
  formatDate as fmtDate,
  formatNameList as fmtNameList,
  type Locale,
  type MessageKey,
  type InterpolationValues,
} from '@evenup/i18n';

interface I18nValue {
  locale: Locale;
  t: (key: MessageKey, values?: InterpolationValues) => string;
  plural: (base: string, count: number, values?: InterpolationValues) => string;
  formatCurrency: (minor: number, currency: string) => string;
  formatDate: (date: string | Date) => string;
  formatNameList: (names: readonly string[], type: 'conjunction' | 'disjunction') => string;
}

const I18nContext = createContext<I18nValue | null>(null);

/**
 * The URL is the single source of truth for locale (see `locale-path.ts` and
 * the middleware) — `locale` comes from the already-validated route segment.
 * There is deliberately no local state here: a locale change is always a
 * navigation (see the header's language switcher), which remounts this
 * whole subtree with a fresh `locale` prop (Next keys the segment provider
 * on the router cache key), so `useState` would only add a stale copy to
 * keep in sync. For the same reason there's no `setLocale` in the context
 * value and no manual `document.documentElement.lang` write — React already
 * owns `<html lang>` via the `[locale]` layout, and a `setLocale` that
 * changed the copy without navigating would silently desync it from the URL
 * (and from the tRPC `x-locale` header), which is exactly the bug this
 * module used to have.
 */
export function I18nProvider({ children, locale }: { children: React.ReactNode; locale: Locale }) {
  const value = useMemo<I18nValue>(() => {
    const translator = createTranslator(locale);
    return {
      locale,
      t: translator,
      plural: (base, count, values) => pluralize(locale, base, count, values),
      formatCurrency: (minor, currency) => fmtCurrency(minor, currency, locale),
      formatDate: (date) => fmtDate(date, locale),
      formatNameList: (names, type) => fmtNameList(names, locale, type),
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
