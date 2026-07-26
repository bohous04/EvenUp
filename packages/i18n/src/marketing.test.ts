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
      const body = tMarketing(locale, 'marketing.pricing.vip.body', { scans: 42, days: 30 });
      expect(body, locale).toContain('42');
      expect(body, locale).not.toContain('150');
    }
  });

  test('every claim about how long a receipt photo is kept interpolates the real retention', () => {
    // The price list, the terms and the privacy policy each quote the photo
    // retention at a paying customer. All three read `RECEIPT_RETENTION_DAYS`
    // through the page, so a hardcoded "30" — or, as shipped, no period at all
    // where the terms promised photos simply "stay saved" — puts a claim in
    // front of a consumer that the cleanup job contradicts.
    const RETENTION_KEYS = [
      'marketing.pricing.vip.body',
      'legal.terms.s4.li1',
      'legal.privacy.s2.li5',
      'legal.privacy.s7.li1',
      'legal.privacy.s8.p3b',
    ] as const;
    for (const locale of LOCALES) {
      for (const key of RETENTION_KEYS) {
        const text = tMarketing(locale, key, { scans: 150, days: 14 });
        expect(text, `${locale}/${key}`).toContain('14');
        expect(text, `${locale}/${key}`).not.toContain('{days}');
        expect(text, `${locale}/${key}`).not.toContain('30');
      }
    }
  });

  test('the withdrawal document quotes the credit checkbox verbatim, not a paraphrase', () => {
    // `legal.refunds.s2.quote` is presented to the reader as the wording they
    // ticked at checkout, so it has to BE that wording: `vip.credits.ack` in
    // the app catalogs, byte for byte, with only the quotation marks added.
    // Reword one without the other and the document quotes a statement the
    // customer was never shown — the operative consent for the § 1837 waiver.
    // Nothing pinned this before; the trial work is a good moment to fix that,
    // because the trial touches the neighbouring subscription copy and leaves
    // the credit waiver deliberately untouched.
    const marks: Record<(typeof LOCALES)[number], readonly [string, string]> = {
      // Czech opens low and closes high (U+201E / U+201C); English uses U+201C / U+201D.
      cs: ['„', '“'],
      en: ['“', '”'],
    };
    for (const locale of LOCALES) {
      const [open, close] = marks[locale];
      expect(tMarketing(locale, 'legal.refunds.s2.quote'), locale).toBe(
        `${open}${catalogs[locale]['vip.credits.ack']}${close}`,
      );
    }
  });

  test('the trial length is interpolated everywhere it is claimed, and never as {days}', () => {
    // `{days}` means the receipt retention throughout this namespace, and
    // `LegalDocument` hands one value bag to every key at once. A trial string
    // written with `{days}` would quietly render the retention period as the
    // trial length. Distinct values here would surface exactly that swap.
    const TRIAL_KEYS = [
      'marketing.pricing.vip.trial',
      'legal.terms.s5.p4',
      'legal.refunds.s3.p3',
    ] as const;
    for (const locale of LOCALES) {
      for (const key of TRIAL_KEYS) {
        const text = tMarketing(locale, key, { trialDays: 7, days: 30, scans: 150 });
        expect(text, `${locale}/${key}`).toContain('7');
        expect(text, `${locale}/${key}`).not.toContain('{trialDays}');
        expect(text, `${locale}/${key}`).not.toContain('30');
      }
    }
  });

  test('the trial copy never suggests it shortens or starts the withdrawal period', () => {
    // The legal pivot of this document: the 14-day clock runs from contract
    // conclusion, so the first charge (day 8 of a 7-day trial) falls inside
    // it. `s3.p4` is the sentence that says so and `s3.p5` is the refund
    // promise that follows from it; neither may quietly disappear.
    for (const locale of LOCALES) {
      const p4 = tMarketing(locale, 'legal.refunds.s3.p4', { trialDays: 7 });
      expect(p4, locale).toMatch(/14|čtrnáct/i);
      expect(tMarketing(locale, 'legal.refunds.s3.p5', { trialDays: 7 }), locale).toContain('1834');
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
