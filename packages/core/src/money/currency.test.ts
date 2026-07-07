import { describe, expect, test } from 'vitest';
import {
  currencyExponent,
  minorToDecimalString,
  decimalStringToMinor,
  isSupportedCurrency,
} from './currency.js';

describe('currencyExponent', () => {
  test('defaults to 2 decimal places for common currencies', () => {
    expect(currencyExponent('CZK')).toBe(2);
    expect(currencyExponent('EUR')).toBe(2);
    expect(currencyExponent('USD')).toBe(2);
  });

  test('returns 0 for zero-decimal currencies', () => {
    expect(currencyExponent('JPY')).toBe(0);
    expect(currencyExponent('KRW')).toBe(0);
  });

  test('returns 3 for three-decimal currencies', () => {
    expect(currencyExponent('KWD')).toBe(3);
    expect(currencyExponent('BHD')).toBe(3);
  });

  test('is case-insensitive', () => {
    expect(currencyExponent('czk')).toBe(2);
  });

  test('falls back to 2 for unknown currency codes', () => {
    expect(currencyExponent('XYZ')).toBe(2);
  });

  test('throws on a malformed currency code', () => {
    expect(() => currencyExponent('CZKK')).toThrow();
    expect(() => currencyExponent('CZ')).toThrow();
  });
});

describe('minorToDecimalString', () => {
  test('formats CZK minor units as a plain decimal string', () => {
    expect(minorToDecimalString(45000, 'CZK')).toBe('450.00');
  });

  test('formats a sub-unit amount with leading zero', () => {
    expect(minorToDecimalString(5, 'CZK')).toBe('0.05');
  });

  test('formats zero-decimal currencies with no decimal point', () => {
    expect(minorToDecimalString(450, 'JPY')).toBe('450');
  });

  test('formats three-decimal currencies', () => {
    expect(minorToDecimalString(1234, 'KWD')).toBe('1.234');
  });

  test('formats negative amounts', () => {
    expect(minorToDecimalString(-45050, 'CZK')).toBe('-450.50');
  });

  test('formats zero', () => {
    expect(minorToDecimalString(0, 'CZK')).toBe('0.00');
  });
});

describe('decimalStringToMinor', () => {
  test('parses a decimal string into integer minor units', () => {
    expect(decimalStringToMinor('450.00', 'CZK')).toBe(45000);
    expect(decimalStringToMinor('450,50', 'CZK')).toBe(45050); // comma decimal (Czech)
  });

  test('parses an integer string', () => {
    expect(decimalStringToMinor('450', 'JPY')).toBe(450);
  });

  test('parses with fewer decimals than the currency exponent', () => {
    expect(decimalStringToMinor('1.5', 'CZK')).toBe(150);
  });

  test('round-trips with minorToDecimalString', () => {
    for (const minor of [0, 5, 99, 45000, -45050]) {
      expect(decimalStringToMinor(minorToDecimalString(minor, 'CZK'), 'CZK')).toBe(minor);
    }
  });

  test('throws when more decimals than the currency supports', () => {
    expect(() => decimalStringToMinor('1.234', 'CZK')).toThrow();
  });

  test('throws on non-numeric input', () => {
    expect(() => decimalStringToMinor('abc', 'CZK')).toThrow();
  });
});

describe('isSupportedCurrency', () => {
  test('accepts well-formed ISO 4217 codes', () => {
    expect(isSupportedCurrency('CZK')).toBe(true);
    expect(isSupportedCurrency('eur')).toBe(true);
  });

  test('rejects malformed codes', () => {
    expect(isSupportedCurrency('CZKK')).toBe(false);
    expect(isSupportedCurrency('12')).toBe(false);
    expect(isSupportedCurrency('')).toBe(false);
  });
});
