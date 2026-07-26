'use client';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
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
  setLocale: (l: Locale) => void;
  t: (key: MessageKey, values?: InterpolationValues) => string;
  plural: (base: string, count: number, values?: InterpolationValues) => string;
  formatCurrency: (minor: number, currency: string) => string;
  formatDate: (date: string | Date) => string;
  formatNameList: (names: readonly string[], type: 'conjunction' | 'disjunction') => string;
}

const I18nContext = createContext<I18nValue | null>(null);

/**
 * The URL is the single source of truth for locale (see `locale-path.ts` and
 * the middleware) — `initialLocale` comes from the already-validated route
 * segment. There is deliberately no `useEffect` reading `localStorage`
 * anymore: that used to flip `/en` back to Czech after hydration, which is
 * exactly the bug this task fixes. `setLocale` only updates local state for
 * the copy/`lang` attribute; the caller (the header's language switcher) is
 * responsible for navigating to the new locale's URL.
 */
export function I18nProvider({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    document.documentElement.lang = l;
  }, []);

  const value = useMemo<I18nValue>(() => {
    const translator = createTranslator(locale);
    return {
      locale,
      setLocale,
      t: translator,
      plural: (base, count, values) => pluralize(locale, base, count, values),
      formatCurrency: (minor, currency) => fmtCurrency(minor, currency, locale),
      formatDate: (date) => fmtDate(date, locale),
      formatNameList: (names, type) => fmtNameList(names, locale, type),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
