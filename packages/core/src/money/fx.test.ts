import { describe, expect, test } from 'vitest';
import * as fc from 'fast-check';
import { parseRate, invertRate, convertMinorUnits, convert } from './fx.js';

describe('parseRate', () => {
  test('parses an integer rate', () => {
    expect(parseRate('25')).toEqual({ numerator: 25, denominator: 1 });
  });

  test('parses a decimal rate exactly (no float)', () => {
    expect(parseRate('24.515')).toEqual({ numerator: 24515, denominator: 1000 });
  });

  test('accepts a comma decimal separator', () => {
    expect(parseRate('24,515')).toEqual({ numerator: 24515, denominator: 1000 });
  });

  test('accepts a numeric input', () => {
    expect(parseRate(25)).toEqual({ numerator: 25, denominator: 1 });
  });

  test('throws on a non-positive rate', () => {
    expect(() => parseRate('0')).toThrow();
    expect(() => parseRate('-1.5')).toThrow();
  });

  test('throws on garbage', () => {
    expect(() => parseRate('abc')).toThrow();
  });
});

describe('invertRate', () => {
  test('swaps numerator and denominator', () => {
    expect(invertRate({ numerator: 25, denominator: 1 })).toEqual({
      numerator: 1,
      denominator: 25,
    });
  });
});

describe('convertMinorUnits', () => {
  test('converts EUR minor units to CZK at a whole rate', () => {
    // 100.00 EUR * 25 = 2500.00 CZK
    expect(convertMinorUnits(10000, parseRate('25'), { fromExponent: 2, toExponent: 2 })).toBe(
      250000,
    );
  });

  test('converts across different exponents (EUR -> JPY)', () => {
    // 100.00 EUR * 130.5 = 13050 JPY (0 decimals)
    expect(convertMinorUnits(10000, parseRate('130.5'), { fromExponent: 2, toExponent: 0 })).toBe(
      13050,
    );
  });

  test('rounds half away from zero by default', () => {
    // 1.00 EUR * 1.005 = 1.005 -> 100.5 minor -> 101
    expect(convertMinorUnits(100, parseRate('1.005'), { fromExponent: 2, toExponent: 2 })).toBe(
      101,
    );
  });

  test('rounds negative amounts half away from zero', () => {
    expect(convertMinorUnits(-100, parseRate('1.005'), { fromExponent: 2, toExponent: 2 })).toBe(
      -101,
    );
  });

  test('supports bankers rounding (half-even)', () => {
    expect(
      convertMinorUnits(100, parseRate('1.005'), {
        fromExponent: 2,
        toExponent: 2,
        rounding: 'half-even',
      }),
    ).toBe(100); // 100.5 -> nearest even -> 100
    expect(
      convertMinorUnits(100, parseRate('1.015'), {
        fromExponent: 2,
        toExponent: 2,
        rounding: 'half-even',
      }),
    ).toBe(102); // 101.5 -> nearest even -> 102
  });

  test('supports floor and ceil', () => {
    expect(
      convertMinorUnits(100, parseRate('1.004'), {
        fromExponent: 2,
        toExponent: 2,
        rounding: 'ceil',
      }),
    ).toBe(101); // 100.4 -> ceil -> 101
    expect(
      convertMinorUnits(100, parseRate('1.006'), {
        fromExponent: 2,
        toExponent: 2,
        rounding: 'floor',
      }),
    ).toBe(100); // 100.6 -> floor -> 100
  });

  test('a rate of 1 with equal exponents is the identity', () => {
    expect(convertMinorUnits(45000, parseRate('1'), { fromExponent: 2, toExponent: 2 })).toBe(
      45000,
    );
  });

  test('converts zero to zero', () => {
    expect(convertMinorUnits(0, parseRate('24.515'), { fromExponent: 2, toExponent: 2 })).toBe(0);
  });

  test('property: scaling the amount scales the result monotonically', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 0, max: 10_000_000 }),
        (a, b) => {
          const rate = parseRate('7.3');
          const opts = { fromExponent: 2, toExponent: 2 } as const;
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          expect(convertMinorUnits(lo, rate, opts)).toBeLessThanOrEqual(
            convertMinorUnits(hi, rate, opts),
          );
        },
      ),
    );
  });

  test('property: converting with a rate then its inverse returns within one minor unit', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), (amount) => {
        const rate = parseRate('24.515');
        const there = convertMinorUnits(amount, rate, { fromExponent: 2, toExponent: 2 });
        const back = convertMinorUnits(there, invertRate(rate), {
          fromExponent: 2,
          toExponent: 2,
        });
        expect(Math.abs(back - amount)).toBeLessThanOrEqual(1);
      }),
    );
  });
});

describe('convert (by currency code)', () => {
  test('derives exponents from the currency codes', () => {
    expect(convert(10000, 'EUR', 'JPY', parseRate('130.5'))).toBe(13050);
  });
});
