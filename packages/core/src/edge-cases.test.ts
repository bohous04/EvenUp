/**
 * Edge-case and validation-branch coverage for the documented error paths and
 * less-common modes across the core modules.
 */
import { describe, expect, test } from 'vitest';
import { allocateByWeights, allocateEvenly } from './money/rounding.js';
import { minorToDecimalString, decimalStringToMinor } from './money/currency.js';
import { parseRate, convertMinorUnits, convert } from './money/fx.js';
import {
  computeSplit,
  splitItemized,
  splitByShares,
  splitByPercentage,
  splitByExactAmounts,
} from './split/split.js';
import { computeDirectDebts, settle, type BalanceTransaction } from './balance/balance.js';
import { buildSpayd } from './spayd/spayd.js';

describe('rounding edge cases', () => {
  test('rejects a total beyond the safe integer range', () => {
    expect(() => allocateByWeights(2 ** 53, [1])).toThrow(RangeError);
  });

  test('returns zeros when both the total and all weights are zero', () => {
    expect(allocateByWeights(0, [0, 0])).toEqual([0, 0]);
  });

  test('allocateEvenly rejects a negative participant count', () => {
    expect(() => allocateEvenly(10, -1)).toThrow();
  });
});

describe('currency edge cases', () => {
  test('minorToDecimalString rejects a non-integer amount', () => {
    expect(() => minorToDecimalString(1.5, 'CZK')).toThrow(TypeError);
  });

  test('formats a negative zero-decimal amount', () => {
    expect(minorToDecimalString(-450, 'JPY')).toBe('-450');
  });

  test('truncates trailing zeros beyond the currency exponent', () => {
    expect(decimalStringToMinor('1.500', 'CZK')).toBe(150);
  });

  test('rejects an amount beyond the safe integer range', () => {
    expect(() => decimalStringToMinor('100000000000000000', 'CZK')).toThrow(RangeError);
  });
});

describe('fx edge cases', () => {
  test('parseRate rejects a numerator beyond the safe integer range', () => {
    expect(() => parseRate('9007199254740.992')).toThrow(RangeError);
  });

  test('supports truncating rounding', () => {
    expect(
      convertMinorUnits(100, parseRate('1.005'), {
        fromExponent: 2,
        toExponent: 2,
        rounding: 'trunc',
      }),
    ).toBe(100);
  });

  test('rejects a non-safe-integer amount', () => {
    expect(() =>
      convertMinorUnits(1.5, parseRate('1'), { fromExponent: 2, toExponent: 2 }),
    ).toThrow(TypeError);
  });

  test('throws when the converted amount overflows the safe integer range', () => {
    expect(() =>
      convertMinorUnits(9_000_000_000_000_000, parseRate('100'), {
        fromExponent: 0,
        toExponent: 0,
      }),
    ).toThrow(RangeError);
  });

  test('convert honors an explicit rounding mode', () => {
    expect(convert(100, 'EUR', 'EUR', parseRate('1.005'), 'floor')).toBe(100);
  });

  test('floor rounds a negative amount toward negative infinity', () => {
    expect(
      convertMinorUnits(-100, parseRate('1.006'), {
        fromExponent: 2,
        toExponent: 2,
        rounding: 'floor',
      }),
    ).toBe(-101);
  });

  test('ceil rounds a negative amount toward positive infinity', () => {
    expect(
      convertMinorUnits(-100, parseRate('1.004'), {
        fromExponent: 2,
        toExponent: 2,
        rounding: 'ceil',
      }),
    ).toBe(-100);
  });

  test('half-even keeps the truncated value when below the halfway point', () => {
    expect(
      convertMinorUnits(100, parseRate('1.004'), {
        fromExponent: 2,
        toExponent: 2,
        rounding: 'half-even',
      }),
    ).toBe(100);
  });
});

describe('split dispatcher + itemized edge cases', () => {
  test('computeSplit routes exact, shares and percentage', () => {
    expect(
      computeSplit({
        type: 'exact',
        total: 100,
        members: [
          { memberId: 'a', exactMinorUnits: 60 },
          { memberId: 'b', exactMinorUnits: 40 },
        ],
      }).shares,
    ).toEqual([
      { memberId: 'a', computedMinorUnits: 60 },
      { memberId: 'b', computedMinorUnits: 40 },
    ]);

    expect(
      computeSplit({
        type: 'shares',
        total: 100,
        members: [
          { memberId: 'a', weight: 3 },
          { memberId: 'b', weight: 1 },
        ],
      }).shares,
    ).toEqual([
      { memberId: 'a', computedMinorUnits: 75 },
      { memberId: 'b', computedMinorUnits: 25 },
    ]);

    expect(
      computeSplit({
        type: 'percentage',
        total: 100,
        members: [
          { memberId: 'a', percentage: 25 },
          { memberId: 'b', percentage: 75 },
        ],
      }).shares,
    ).toEqual([
      { memberId: 'a', computedMinorUnits: 25 },
      { memberId: 'b', computedMinorUnits: 75 },
    ]);
  });

  test('itemized supports a shares-based extra charge', () => {
    const shares = splitItemized({
      items: [{ totalMinorUnits: 100, memberIds: ['a', 'b'] }],
      extraCharges: [
        {
          amountMinorUnits: 30,
          allocation: {
            kind: 'shares',
            members: [
              { memberId: 'a', weight: 2 },
              { memberId: 'b', weight: 1 },
            ],
          },
        },
      ],
    });
    // items: a=50 b=50; extra 30 by 2:1 -> a=20 b=10
    expect(shares).toEqual([
      { memberId: 'a', computedMinorUnits: 70 },
      { memberId: 'b', computedMinorUnits: 60 },
    ]);
  });

  test('itemized rejects an empty item list', () => {
    expect(() => splitItemized({ items: [] })).toThrow();
  });

  test('splitByShares / splitByPercentage / splitByExactAmounts reject empty members', () => {
    expect(() => splitByShares(100, [])).toThrow();
    expect(() => splitByPercentage(100, [])).toThrow();
  });

  test('splitByExactAmounts rejects a non-integer amount', () => {
    expect(() => splitByExactAmounts(100, [{ memberId: 'a', exactMinorUnits: 100.5 }])).toThrow(
      TypeError,
    );
  });

  test('splitByPercentage rejects a negative percentage', () => {
    expect(() =>
      splitByPercentage(100, [
        { memberId: 'a', percentage: -10 },
        { memberId: 'b', percentage: 110 },
      ]),
    ).toThrow();
  });

  test('itemized rejects a non-integer item total', () => {
    expect(() => splitItemized({ items: [{ totalMinorUnits: 10.5, memberIds: ['a'] }] })).toThrow(
      TypeError,
    );
  });

  test('itemized rejects a non-integer extra charge', () => {
    expect(() =>
      splitItemized({
        items: [{ totalMinorUnits: 10, memberIds: ['a'] }],
        extraCharges: [{ amountMinorUnits: 1.5, allocation: { kind: 'proportional' } }],
      }),
    ).toThrow(TypeError);
  });

  test('itemized rejects an empty evenly / shares charge', () => {
    expect(() =>
      splitItemized({
        items: [{ totalMinorUnits: 10, memberIds: ['a'] }],
        extraCharges: [{ amountMinorUnits: 5, allocation: { kind: 'evenly', memberIds: [] } }],
      }),
    ).toThrow();
    expect(() =>
      splitItemized({
        items: [{ totalMinorUnits: 10, memberIds: ['a'] }],
        extraCharges: [{ amountMinorUnits: 5, allocation: { kind: 'shares', members: [] } }],
      }),
    ).toThrow();
  });
});

describe('direct debts edge cases', () => {
  test('skips a self-debt when a payer is also a beneficiary', () => {
    const txns: BalanceTransaction[] = [
      {
        payers: [{ memberId: 'a', amountMinorUnits: 100 }],
        splits: [
          { memberId: 'a', computedMinorUnits: 40 },
          { memberId: 'b', computedMinorUnits: 60 },
        ],
      },
    ];
    expect(computeDirectDebts(txns)).toEqual([
      { fromMemberId: 'b', toMemberId: 'a', amountMinorUnits: 60 },
    ]);
  });

  test('emits a debt from the lexically-first member when they owe', () => {
    // payer b, beneficiary a -> a owes b; 'a' < 'b' so diff > 0 path
    const txns: BalanceTransaction[] = [
      {
        payers: [{ memberId: 'b', amountMinorUnits: 50 }],
        splits: [{ memberId: 'a', computedMinorUnits: 50 }],
      },
    ];
    expect(computeDirectDebts(txns)).toEqual([
      { fromMemberId: 'a', toMemberId: 'b', amountMinorUnits: 50 },
    ]);
  });

  test('skips a transaction whose payers sum to zero', () => {
    const txns: BalanceTransaction[] = [
      { payers: [], splits: [{ memberId: 'a', computedMinorUnits: 100 }] },
    ];
    expect(computeDirectDebts(txns)).toEqual([]);
  });

  test('settle defaults to simplify=true when no options are given', () => {
    const txns: BalanceTransaction[] = [
      {
        payers: [{ memberId: 'a', amountMinorUnits: 200 }],
        splits: [
          { memberId: 'b', computedMinorUnits: 100 },
          { memberId: 'c', computedMinorUnits: 100 },
        ],
      },
    ];
    expect(settle(txns)).toEqual([
      { fromMemberId: 'b', toMemberId: 'a', amountMinorUnits: 100 },
      { fromMemberId: 'c', toMemberId: 'a', amountMinorUnits: 100 },
    ]);
  });
});

describe('spayd optional attributes', () => {
  const iban = 'CZ6508000000192000145399';

  test('emits CC for a currency without an amount', () => {
    expect(buildSpayd({ iban, currency: 'CZK' })).toBe(`SPD*1.0*ACC:${iban}*CC:CZK`);
  });

  test('emits a payment reference (RF)', () => {
    expect(buildSpayd({ iban, reference: 'INV2026' })).toContain('RF:INV2026');
  });

  test('emits specific and constant symbols', () => {
    const spd = buildSpayd({ iban, specificSymbol: '123', constantSymbol: '0558' });
    expect(spd).toContain('X-SS:123');
    expect(spd).toContain('X-KS:0558');
  });

  test('rejects an out-of-range date', () => {
    expect(() => buildSpayd({ iban, date: '2026-13-01' })).toThrow();
  });

  test('drops control characters and percent-encodes non-ASCII in the message', () => {
    const spd = buildSpayd({ iban, message: 'a\nb€' });
    // newline dropped, euro sign UTF-8 percent-encoded
    expect(spd).toContain('MSG:ab%E2%82%AC');
  });
});
