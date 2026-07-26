import { describe, expect, test, vi } from 'vitest';
import {
  t,
  plural,
  createTranslator,
  formatCurrency,
  formatNumber,
  formatDate,
  formatNameList,
  catalogs,
  LOCALES,
  DEFAULT_LOCALE,
} from './index.js';
import { cs } from './locales/cs.js';

describe('catalog integrity (FR-10.1, FR-10.4)', () => {
  test('Czech is the default locale', () => {
    expect(DEFAULT_LOCALE).toBe('cs');
  });

  test('every locale defines exactly the same keys as Czech', () => {
    const csKeys = Object.keys(cs).sort();
    for (const locale of LOCALES) {
      expect(Object.keys(catalogs[locale]).sort()).toEqual(csKeys);
    }
  });

  test('no message is left empty', () => {
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(catalogs[locale])) {
        expect(value, `${locale}/${key}`).not.toBe('');
      }
    }
  });
});

describe('t (translation + interpolation)', () => {
  test('returns the Czech string by default', () => {
    expect(t('cs', 'group.create')).toBe('Vytvořit skupinu');
  });

  test('returns the English string', () => {
    expect(t('en', 'group.create')).toBe('Create group');
  });

  test('interpolates named placeholders', () => {
    expect(t('en', 'balance.owes', { debtor: 'Petr', creditor: 'Olivia', amount: '450 Kč' })).toBe(
      'Petr owes Olivia 450 Kč',
    );
  });

  test('leaves unknown placeholders untouched', () => {
    expect(t('en', 'balance.isOwed', {})).toBe('{member} is owed {amount}');
  });

  test('falls back to the default locale for a missing translation', () => {
    // @ts-expect-error intentionally unknown locale to exercise the fallback
    expect(t('de', 'common.save')).toBe(cs['common.save']);
  });
});

describe('createTranslator', () => {
  test('binds a locale for repeated use', () => {
    const tr = createTranslator('en');
    expect(tr('common.cancel')).toBe('Cancel');
  });
});

describe('plural (CLDR plural selection)', () => {
  test('Czech picks one / few / other by count', () => {
    expect(plural('cs', 'group.transactions', 1)).toBe('1 transakce');
    expect(plural('cs', 'group.transactions', 3)).toBe('3 transakce');
    expect(plural('cs', 'group.transactions', 5)).toBe('5 transakcí');
    expect(plural('cs', 'group.transactions', 0)).toBe('0 transakcí');
  });

  test('English picks one / other by count', () => {
    expect(plural('en', 'group.transactions', 1)).toBe('1 transaction');
    expect(plural('en', 'group.transactions', 2)).toBe('2 transactions');
    expect(plural('en', 'group.transactions', 0)).toBe('0 transactions');
  });

  test('Czech decimal counts select the "many" form', () => {
    expect(plural('cs', 'group.transactions', 1.5)).toBe('1.5 transakce');
  });

  test('falls back: unknown locale → default catalog', () => {
    // @ts-expect-error unknown locale exercises the default-catalog fallback
    expect(plural('de', 'group.transactions', 5)).toBe('5 transakcí');
  });

  test('falls back: unknown base → the base string itself', () => {
    expect(plural('en', 'totally.unknown', 2)).toBe('totally.unknown');
  });

  // React Native's Hermes engine ships `Intl.NumberFormat`/`DateTimeFormat` but
  // NOT `Intl.PluralRules`, so `pluralCategory` has a hand-written CLDR fallback.
  // Node has the real thing, which lets us assert the two agree exactly —
  // otherwise the fallback could drift and only ever break on device.
  test('the no-Intl.PluralRules fallback matches Intl exactly', async () => {
    const { pluralCategory } = await import('./format.js');
    const intlLocale = { cs: 'cs-CZ', en: 'en-US' } as const;
    const counts = [0, 1, 2, 3, 4, 5, 6, 10, 11, 21, 100, 101, 1000, 0.5, 1.5, 2.5];

    const real = Intl.PluralRules;
    try {
      for (const locale of ['en', 'cs'] as const) {
        const expected = counts.map((n) => new real(intlLocale[locale]).select(n));
        // Hide Intl.PluralRules so `format.ts` takes the fallback branch.
        (Intl as { PluralRules?: unknown }).PluralRules = undefined;
        vi.resetModules();
        const { pluralCategory: fallbackImpl } = await import('./format.js');
        const actual = counts.map((n) => fallbackImpl(n, locale));
        (Intl as { PluralRules?: unknown }).PluralRules = real;
        expect(actual).toEqual(expected);
      }
    } finally {
      (Intl as { PluralRules?: unknown }).PluralRules = real;
      vi.resetModules();
    }

    // And the live (Intl-backed) export still works after the swap.
    expect(pluralCategory(3, 'cs')).toBe('few');
  });
});

describe('formatCurrency (FR-10.3)', () => {
  test('formats CZK in Czech as "1 234,50 Kč"', () => {
    const formatted = formatCurrency(123450, 'CZK', 'cs');
    expect(formatted).toContain('1');
    expect(formatted).toContain('234');
    expect(formatted).toContain('50');
    expect(formatted).toContain('Kč');
  });

  test('formats from integer minor units (4500 cents -> 45)', () => {
    expect(formatCurrency(4500, 'CZK', 'cs')).toMatch(/45,00/);
  });

  test('formats a zero-decimal currency without decimals', () => {
    expect(formatCurrency(4500, 'JPY', 'en')).toMatch(/4,500/);
  });

  test('formats negative amounts', () => {
    expect(formatCurrency(-4500, 'CZK', 'cs')).toMatch(/-|−/);
  });

  test('formats USD in English', () => {
    expect(formatCurrency(123450, 'USD', 'en')).toBe('$1,234.50');
  });
});

describe('formatNumber', () => {
  test('uses a comma decimal separator in Czech', () => {
    expect(formatNumber(1234.5, 'cs')).toMatch(/1\s?234,5/);
  });

  test('uses a dot decimal separator in English', () => {
    expect(formatNumber(1234.5, 'en')).toBe('1,234.5');
  });
});

describe('formatDate', () => {
  test('formats an ISO date in Czech', () => {
    const formatted = formatDate('2026-06-22', 'cs');
    expect(formatted).toContain('2026');
    expect(formatted).toContain('22');
  });

  test('accepts a Date object', () => {
    const formatted = formatDate(new Date('2026-06-22T00:00:00Z'), 'en');
    expect(formatted).toContain('2026');
  });

  test('throws on an invalid date', () => {
    expect(() => formatDate('not-a-date', 'en')).toThrow();
  });
});

describe('formatNameList', () => {
  test('joins two names as a disjunction (one of you pays)', () => {
    expect(formatNameList(['Petr', 'Jana'], 'cs', 'disjunction')).toBe('Petr nebo Jana');
    expect(formatNameList(['Petr', 'Jana'], 'en', 'disjunction')).toBe('Petr or Jana');
  });

  test('joins two names as a conjunction (a statement of fact)', () => {
    expect(formatNameList(['Petr', 'Jana'], 'cs', 'conjunction')).toBe('Petr a Jana');
    expect(formatNameList(['Petr', 'Jana'], 'en', 'conjunction')).toBe('Petr and Jana');
  });

  test('joins three names', () => {
    expect(formatNameList(['Petr', 'Jana', 'Filip'], 'cs', 'disjunction')).toBe(
      'Petr, Jana nebo Filip',
    );
    expect(formatNameList(['Petr', 'Jana', 'Filip'], 'en', 'disjunction')).toBe(
      'Petr, Jana, or Filip',
    );
  });

  test('truncates beyond three names and appends a +N chip', () => {
    expect(formatNameList(['Petr', 'Jana', 'Filip', 'Zoe'], 'cs', 'disjunction')).toBe(
      'Petr, Jana, Filip +1',
    );
    expect(formatNameList(['Petr', 'Jana', 'Filip', 'Zoe', 'Adam'], 'en', 'conjunction')).toBe(
      'Petr, Jana, Filip +2',
    );
  });

  test('the truncated branch never inserts a conjunction word', () => {
    // Czech Intl.ListFormat(type:'unit') would render "Petr, Jana a Filip" — a lie
    // when the list continues. The truncated branch must join with a plain comma.
    expect(formatNameList(['Petr', 'Jana', 'Filip', 'Zoe'], 'cs', 'conjunction')).not.toContain(
      ' a Filip',
    );
  });

  test('a single name is returned as-is', () => {
    expect(formatNameList(['Jana'], 'cs', 'disjunction')).toBe('Jana');
    expect(formatNameList(['Jana'], 'en', 'conjunction')).toBe('Jana');
  });

  test('respects a custom max', () => {
    expect(formatNameList(['Petr', 'Jana', 'Filip'], 'en', 'conjunction', 2)).toBe('Petr, Jana +1');
  });
});
