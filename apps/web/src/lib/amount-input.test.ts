import { describe, expect, test } from 'vitest';
import { clampAmountDecimals } from './amount-input';

describe('clampAmountDecimals', () => {
  test('caps a 2-decimal currency to two fraction digits', () => {
    expect(clampAmountDecimals('12.345', 'CZK')).toBe('12.34');
    expect(clampAmountDecimals('12.3', 'EUR')).toBe('12.3');
    expect(clampAmountDecimals('12.34', 'USD')).toBe('12.34');
  });

  test('leaves whole numbers untouched', () => {
    expect(clampAmountDecimals('1234', 'CZK')).toBe('1234');
    expect(clampAmountDecimals('', 'CZK')).toBe('');
  });

  test('keeps a comma separator (Czech decimal) and clamps it', () => {
    expect(clampAmountDecimals('12,5', 'CZK')).toBe('12,5');
    expect(clampAmountDecimals('12,567', 'CZK')).toBe('12,56');
  });

  test('preserves an in-progress trailing separator', () => {
    expect(clampAmountDecimals('12.', 'CZK')).toBe('12.');
    expect(clampAmountDecimals('.', 'CZK')).toBe('.');
  });

  test('drops the fraction entirely for a zero-decimal currency', () => {
    expect(clampAmountDecimals('450.5', 'JPY')).toBe('450');
    expect(clampAmountDecimals('450.', 'JPY')).toBe('450');
  });

  test('honours a three-decimal currency', () => {
    expect(clampAmountDecimals('1.2345', 'KWD')).toBe('1.234');
  });

  test('collapses stray extra separators into one fraction', () => {
    expect(clampAmountDecimals('1.2.3', 'CZK')).toBe('1.23');
  });
});
