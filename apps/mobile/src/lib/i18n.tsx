import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as Localization from 'expo-localization';
import {
  DEFAULT_LOCALE,
  createTranslator,
  formatCurrency as fmtCurrency,
  formatDate as fmtDate,
  type Locale,
  type MessageKey,
  type InterpolationValues,
} from '@evenup/i18n';
import { resolveInitialLocale } from './resolve-locale';

const LOCALE_KEY = 'evenup.locale';

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: MessageKey, values?: InterpolationValues) => string;
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
      const device = Localization.getLocales()[0]?.languageTag ?? null;
      setLocaleState(resolveInitialLocale(stored, device));
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
