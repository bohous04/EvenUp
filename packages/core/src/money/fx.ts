/**
 * Foreign-exchange conversion on integer minor units. (PRD FR-8.x, §7.3)
 *
 * Rates are represented as an **exact rational** (`numerator / denominator`,
 * with a power-of-ten denominator) parsed from a decimal string, so there is no
 * floating-point drift. The conversion itself is computed with `bigint` to stay
 * exact for any realistic amount, then rounded to the target currency's minor
 * units with a configurable, deterministic rounding mode.
 */

import { currencyExponent, type CurrencyCode } from './currency.js';

export type RoundingMode = 'trunc' | 'floor' | 'ceil' | 'half-up' | 'half-even';

/** An exchange rate as an exact rational: `to = from * numerator / denominator`. */
export interface Rate {
  readonly numerator: number;
  readonly denominator: number;
}

export interface ConvertOptions {
  readonly fromExponent: number;
  readonly toExponent: number;
  readonly rounding?: RoundingMode;
}

/** Parse a positive decimal rate (`.` or `,` separator) into an exact rational. */
export function parseRate(value: string | number): Rate {
  const str = typeof value === 'number' ? String(value) : value.trim().replace(',', '.');
  const match = /^(\d+)(?:\.(\d+))?$/.exec(str);
  if (!match) {
    throw new TypeError(`Cannot parse exchange rate: ${JSON.stringify(value)}`);
  }
  const whole = match[1]!;
  const fraction = match[2] ?? '';
  const numerator = Number(whole + fraction);
  const denominator = 10 ** fraction.length;
  if (!Number.isSafeInteger(numerator)) {
    throw new RangeError(`Exchange rate ${JSON.stringify(value)} exceeds the safe integer range`);
  }
  if (numerator <= 0) {
    throw new RangeError(`Exchange rate must be positive, received ${JSON.stringify(value)}`);
  }
  return { numerator, denominator };
}

/** Invert a rate (swap numerator and denominator). */
export function invertRate(rate: Rate): Rate {
  return { numerator: rate.denominator, denominator: rate.numerator };
}

function pow10(exp: number): bigint {
  return 10n ** BigInt(exp);
}

/** Divide two bigints with the given rounding mode. `denominator` must be positive. */
function divideRound(numerator: bigint, denominator: bigint, mode: RoundingMode): bigint {
  const q = numerator / denominator; // truncated toward zero
  const r = numerator - q * denominator; // sign matches numerator
  if (r === 0n) return q;

  const sign = numerator > 0n ? 1n : -1n;
  const twiceAbsR = (r < 0n ? -r : r) * 2n;

  switch (mode) {
    case 'trunc':
      return q;
    case 'floor':
      return numerator >= 0n ? q : q - 1n;
    case 'ceil':
      return numerator > 0n ? q + 1n : q;
    case 'half-up':
      return twiceAbsR >= denominator ? q + sign : q;
    case 'half-even':
      if (twiceAbsR > denominator) return q + sign;
      if (twiceAbsR < denominator) return q;
      return q % 2n === 0n ? q : q + sign;
  }
}

/**
 * Convert an integer minor-unit amount from one currency to another using an
 * exact rational rate. Returns integer minor units in the target currency.
 */
export function convertMinorUnits(
  amountMinor: number,
  rate: Rate,
  options: ConvertOptions,
): number {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new TypeError(`amount must be a safe integer, received ${amountMinor}`);
  }
  const { fromExponent, toExponent, rounding = 'half-up' } = options;

  // result = amount * num * 10^toExp / (den * 10^fromExp)
  const numerator = BigInt(amountMinor) * BigInt(rate.numerator) * pow10(toExponent);
  const denominator = BigInt(rate.denominator) * pow10(fromExponent);
  const result = divideRound(numerator, denominator, rounding);

  if (result > BigInt(Number.MAX_SAFE_INTEGER) || result < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError('Converted amount exceeds the safe integer range');
  }
  const asNumber = Number(result);
  return asNumber === 0 ? 0 : asNumber; // normalize -0
}

/** Convenience wrapper that derives minor-unit exponents from currency codes. */
export function convert(
  amountMinor: number,
  fromCurrency: CurrencyCode,
  toCurrency: CurrencyCode,
  rate: Rate,
  rounding?: RoundingMode,
): number {
  return convertMinorUnits(amountMinor, rate, {
    fromExponent: currencyExponent(fromCurrency),
    toExponent: currencyExponent(toCurrency),
    rounding,
  });
}
