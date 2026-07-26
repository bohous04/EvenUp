import { describe, expect, test } from 'vitest';
import {
  tMarketing,
  createMarketingTranslator,
  marketingCatalogs,
  LOCALES,
  catalogs,
} from './index.js';
import { marketingCs } from './locales/marketing.js';

describe('marketing catalog integrity', () => {
  test('every locale defines exactly the same keys as Czech', () => {
    const csKeys = Object.keys(marketingCs).sort();
    for (const locale of LOCALES) {
      expect(Object.keys(marketingCatalogs[locale]).sort()).toEqual(csKeys);
    }
  });

  test('no marketing message is left empty', () => {
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(marketingCatalogs[locale])) {
        expect(value, `${locale}/${key}`).not.toBe('');
      }
    }
  });

  test('stays a separate namespace — no key overlaps the app catalogs', () => {
    // The two namespaces are split so marketing prose never ships inside the
    // app's message payload; an overlapping key would mean one of them had
    // drifted back into the other.
    const appKeys = new Set(Object.keys(catalogs.cs));
    for (const key of Object.keys(marketingCs)) {
      expect(appKeys.has(key), key).toBe(false);
    }
  });
});

describe('tMarketing', () => {
  test('returns the Czech string by default', () => {
    expect(tMarketing('cs', 'marketing.hero.title')).toBe(marketingCs['marketing.hero.title']);
  });

  test('returns the English string', () => {
    expect(tMarketing('en', 'marketing.hero.title')).toBe('Send two payments instead of eight');
  });

  test('interpolates named placeholders', () => {
    expect(tMarketing('en', 'marketing.pricing.packs.item', { scans: 5 })).toBe('Pack of 5 scans');
    expect(tMarketing('cs', 'marketing.pricing.packs.item', { scans: 5 })).toBe('Balíček 5 skenů');
  });

  test('the VIP allowance is interpolated, never written into the copy', () => {
    // Guards MINOR 6: the number is `VIP_SCANS_PER_PERIOD`, and a hardcoded
    // "150" here would silently outlive a change to it.
    for (const locale of LOCALES) {
      const body = tMarketing(locale, 'marketing.pricing.vip.body', { scans: 42 });
      expect(body, locale).toContain('42');
      expect(body, locale).not.toContain('150');
    }
  });

  test('falls back to the default locale for an unknown locale', () => {
    // @ts-expect-error intentionally unknown locale to exercise the fallback
    expect(tMarketing('de', 'marketing.hero.title')).toBe(marketingCs['marketing.hero.title']);
  });

  test('createMarketingTranslator binds a locale', () => {
    const tm = createMarketingTranslator('en');
    expect(tm('marketing.nav.pricing')).toBe('Pricing');
  });
});
