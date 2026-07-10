import { currencyExponent } from '@evenup/core';

/**
 * Clamp a free-typed amount to the currency's supported decimal places, so an
 * amount field can never hold more fraction digits than the currency allows
 * (2 for CZK/EUR/USD, 0 for JPY, 3 for KWD…).
 *
 * It keeps the text the user is mid-typing intact — a trailing separator stays,
 * `.` and `,` are both accepted — and reformats nothing else, so the caret is
 * only disturbed when an over-long fraction is actually rejected.
 */
export function clampAmountDecimals(raw: string, currency: string): string {
  const sepIndex = raw.search(/[.,]/);
  if (sepIndex === -1) return raw;

  const intPart = raw.slice(0, sepIndex);
  const exp = currencyExponent(currency);
  // A zero-decimal currency takes no fraction at all — drop the separator.
  if (exp === 0) return intPart;

  const sep = raw[sepIndex]!;
  // Everything after the first separator is the fraction; collapse any further
  // separators the user typed, then cap to the currency's exponent.
  const fraction = raw.slice(sepIndex + 1).replace(/[.,]/g, '');
  return `${intPart}${sep}${fraction.slice(0, exp)}`;
}
