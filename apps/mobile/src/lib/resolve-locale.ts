import { DEFAULT_LOCALE, type Locale } from '@evenup/i18n';

const SUPPORTED: readonly Locale[] = ['cs', 'en'];

function normalize(tag: string | null): Locale | null {
  if (!tag) return null;
  const lang = tag.toLowerCase().split(/[-_]/)[0];
  return SUPPORTED.find((l) => l === lang) ?? null;
}

/** Choose the startup locale: stored preference → device language → default (cs). */
export function resolveInitialLocale(stored: string | null, deviceTag: string | null): Locale {
  return normalize(stored) ?? normalize(deviceTag) ?? DEFAULT_LOCALE;
}
