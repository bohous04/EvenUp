import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import {
  DEFAULT_LOCALE,
  createTranslator,
  plural as pluralize,
  formatCurrency as fmtCurrency,
  formatDate as fmtDate,
  type Locale,
  type MessageKey,
  type InterpolationValues,
} from '@evenup/i18n';
import { resolveInitialLocale } from './resolve-locale';

const LOCALE_KEY = 'evenup.locale';

/**
 * Device language via Hermes' built-in `Intl` (e.g. "cs-CZ") — avoids a native
 * module. `expo-localization` was dropped: its SDK-52 Swift no longer compiles
 * against the iOS 26 SDK ("switch must be exhaustive"), and `Intl` covers the
 * one thing we needed (the device language tag).
 */
function deviceLanguageTag(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale ?? null;
  } catch {
    return null;
  }
}

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: MessageKey, values?: InterpolationValues) => string;
  /** Count-aware lookup — picks `<base>.one|few|many|other` for the locale. */
  plural: (base: string, count: number, values?: InterpolationValues) => string;
  formatCurrency: (minor: number, currency: string) => string;
  formatDate: (date: Date) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  // Resolve the startup locale once: stored preference → device language → cs.
  useEffect(() => {
    void (async () => {
      const stored = await SecureStore.getItemAsync(LOCALE_KEY).catch(() => null);
      setLocaleState(resolveInitialLocale(stored, deviceLanguageTag()));
    })();
  }, []);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    void SecureStore.setItemAsync(LOCALE_KEY, l).catch(() => {});
  };

  const value = useMemo<I18nValue>(() => {
    const translator = createTranslator(locale);
    return {
      locale,
      setLocale,
      t: translator,
      plural: (base, count, values) => pluralize(locale, base, count, values),
      formatCurrency: (minor, currency) => fmtCurrency(minor, currency, locale),
      formatDate: (date) => fmtDate(date, locale),
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
