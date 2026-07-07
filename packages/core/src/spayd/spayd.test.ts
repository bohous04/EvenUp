import { describe, expect, test } from 'vitest';
import { buildSpayd, isValidIban, normalizeIban, formatSpaydDate } from './spayd.js';

describe('buildSpayd (§16.1, FR-7.1)', () => {
  test('builds the canonical PRD example string', () => {
    expect(
      buildSpayd({
        iban: 'CZ5508000000001234567899',
        amountMinorUnits: 45000,
        currency: 'CZK',
        message: 'EvenUp - Tatry 2026',
        variableSymbol: '20260622',
      }),
    ).toBe(
      'SPD*1.0*ACC:CZ5508000000001234567899*AM:450.00*CC:CZK*MSG:EvenUp - Tatry 2026*X-VS:20260622',
    );
  });

  test('requires only an IBAN', () => {
    expect(buildSpayd({ iban: 'CZ6508000000192000145399' })).toBe(
      'SPD*1.0*ACC:CZ6508000000192000145399',
    );
  });

  test('strips spaces and upper-cases the IBAN', () => {
    expect(buildSpayd({ iban: 'cz65 0800 0000 1920 0014 5399' })).toBe(
      'SPD*1.0*ACC:CZ6508000000192000145399',
    );
  });

  test('appends BIC to the account field', () => {
    expect(buildSpayd({ iban: 'CZ6508000000192000145399', bic: 'GIBACZPX' })).toBe(
      'SPD*1.0*ACC:CZ6508000000192000145399+GIBACZPX',
    );
  });

  test('formats the amount with the currency exponent', () => {
    expect(
      buildSpayd({ iban: 'CZ6508000000192000145399', amountMinorUnits: 5, currency: 'CZK' }),
    ).toContain('AM:0.05');
  });

  test('includes recipient name and date', () => {
    const spd = buildSpayd({
      iban: 'CZ6508000000192000145399',
      recipientName: 'Olivia',
      date: '2026-06-22',
    });
    expect(spd).toContain('RN:Olivia');
    expect(spd).toContain('DT:20260622');
  });

  test('strips Czech diacritics from the message', () => {
    const spd = buildSpayd({ iban: 'CZ6508000000192000145399', message: 'Příště zaplatí Žofie' });
    expect(spd).toContain('MSG:Priste zaplati Zofie');
  });

  test('percent-encodes the reserved * and % characters in values', () => {
    const spd = buildSpayd({ iban: 'CZ6508000000192000145399', message: 'a*b%c' });
    expect(spd).toContain('MSG:a%2Ab%25c');
  });

  test('throws on a malformed IBAN', () => {
    expect(() => buildSpayd({ iban: 'NOPE' })).toThrow();
  });

  test('throws when an amount is given without a currency', () => {
    expect(() => buildSpayd({ iban: 'CZ6508000000192000145399', amountMinorUnits: 100 })).toThrow();
  });

  test('throws on a non-numeric variable symbol', () => {
    expect(() => buildSpayd({ iban: 'CZ6508000000192000145399', variableSymbol: 'abc' })).toThrow();
  });

  test('throws on a variable symbol longer than 10 digits', () => {
    expect(() =>
      buildSpayd({ iban: 'CZ6508000000192000145399', variableSymbol: '123456789012' }),
    ).toThrow();
  });
});

describe('isValidIban', () => {
  test('accepts a valid Czech IBAN (mod-97 checksum)', () => {
    expect(isValidIban('CZ6508000000192000145399')).toBe(true);
  });

  test('accepts a valid IBAN with spaces', () => {
    expect(isValidIban('CZ65 0800 0000 1920 0014 5399')).toBe(true);
  });

  test('rejects an IBAN with a broken checksum', () => {
    expect(isValidIban('CZ6608000000192000145399')).toBe(false);
  });

  test('rejects malformed input', () => {
    expect(isValidIban('NOPE')).toBe(false);
    expect(isValidIban('')).toBe(false);
  });
});

describe('normalizeIban', () => {
  test('removes spaces and upper-cases', () => {
    expect(normalizeIban('cz65 0800 0000 1920 0014 5399')).toBe('CZ6508000000192000145399');
  });
});

describe('formatSpaydDate', () => {
  test('converts an ISO date to YYYYMMDD', () => {
    expect(formatSpaydDate('2026-06-22')).toBe('20260622');
  });

  test('passes through an already-compact date', () => {
    expect(formatSpaydDate('20260622')).toBe('20260622');
  });

  test('throws on an invalid date', () => {
    expect(() => formatSpaydDate('not-a-date')).toThrow();
  });
});
