import { describe, expect, test } from 'vitest';
import {
  t,
  createTranslator,
  formatCurrency,
  formatNumber,
  formatDate,
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
