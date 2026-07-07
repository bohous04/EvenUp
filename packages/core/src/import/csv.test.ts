import { describe, expect, test } from 'vitest';
import { parseCsv, parseExpensesCsv } from './csv.js';

describe('parseCsv (RFC 4180-ish)', () => {
  test('parses simple rows', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  test('handles quoted fields containing commas and newlines', () => {
    expect(parseCsv('"a,b","c\nd"')).toEqual([['a,b', 'c\nd']]);
  });

  test('handles escaped double quotes', () => {
    expect(parseCsv('"a""b",c')).toEqual([['a"b', 'c']]);
  });

  test('handles CRLF line endings and a trailing newline', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  test('keeps empty fields', () => {
    expect(parseCsv('a,,c')).toEqual([['a', '', 'c']]);
  });

  test('returns empty for empty input', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('   \n  ')).toEqual([]);
  });
});

describe('parseExpensesCsv', () => {
  const HEADER = 'Date,Description,Category,Cost,Currency';

  test('maps Splitwise-style rows to normalized expenses', () => {
    const csv = [
      HEADER,
      '2026-06-22,Groceries,groceries,123.50,CZK',
      '2026-06-23,Taxi,transport,250,CZK',
    ].join('\n');
    const { rows, errors } = parseExpensesCsv(csv, { defaultCurrency: 'CZK' });
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        date: '2026-06-22',
        title: 'Groceries',
        category: 'groceries',
        currency: 'CZK',
        amountMinorUnits: 12350,
      },
      {
        date: '2026-06-23',
        title: 'Taxi',
        category: 'transport',
        currency: 'CZK',
        amountMinorUnits: 25000,
      },
    ]);
  });

  test('accepts header aliases and a comma decimal', () => {
    const csv = ['datum;title;amount', '2026-01-01;Oběd;99,90'].join('\n');
    const { rows } = parseExpensesCsv(csv, { defaultCurrency: 'CZK', delimiter: ';' });
    expect(rows[0]).toMatchObject({ title: 'Oběd', amountMinorUnits: 9990, currency: 'CZK' });
  });

  test('falls back to the default currency when no currency column', () => {
    const csv = ['Date,Description,Amount', '2026-06-22,Lunch,10.00'].join('\n');
    const { rows } = parseExpensesCsv(csv, { defaultCurrency: 'EUR' });
    expect(rows[0]!.currency).toBe('EUR');
    expect(rows[0]!.amountMinorUnits).toBe(1000);
  });

  test('collects row errors instead of throwing', () => {
    const csv = [HEADER, '2026-06-22,Good,groceries,10.00,CZK', 'bad-date,Bad,,nope,CZK'].join(
      '\n',
    );
    const { rows, errors } = parseExpensesCsv(csv, { defaultCurrency: 'CZK' });
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.line).toBe(3);
  });

  test('throws when required columns are missing', () => {
    expect(() => parseExpensesCsv('Foo,Bar\n1,2', { defaultCurrency: 'CZK' })).toThrow();
  });

  test('ignores an unknown category (left to the caller to validate)', () => {
    const csv = [HEADER, '2026-06-22,Thing,weirdcat,5.00,CZK'].join('\n');
    const { rows } = parseExpensesCsv(csv, { defaultCurrency: 'CZK' });
    expect(rows[0]!.category).toBe('weirdcat');
  });

  test('reports a missing description as a row error', () => {
    const csv = [HEADER, '2026-06-22,,groceries,5.00,CZK'].join('\n');
    const { rows, errors } = parseExpensesCsv(csv, { defaultCurrency: 'CZK' });
    expect(rows).toHaveLength(0);
    expect(errors[0]!.message).toMatch(/description/i);
  });

  test('reports an invalid amount as a row error', () => {
    const csv = [HEADER, '2026-06-22,Thing,groceries,notmoney,CZK'].join('\n');
    const { errors } = parseExpensesCsv(csv, { defaultCurrency: 'CZK' });
    expect(errors[0]!.message).toMatch(/amount/i);
  });

  test('returns empty results for an empty CSV body', () => {
    expect(parseExpensesCsv('', { defaultCurrency: 'CZK' })).toEqual({ rows: [], errors: [] });
  });
});
