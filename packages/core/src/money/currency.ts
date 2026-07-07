/**
 * Currency metadata and exact (float-free) conversion between integer minor
 * units and human-readable decimal strings.
 *
 * The decimal-string helpers here are **not** locale formatters — that lives in
 * `@evenup/i18n`. These produce/parse the canonical machine form (a plain
 * decimal point) used by SPAYD generation, FX parsing, and round-tripping.
 */

export type CurrencyCode = string;

const CODE_RE = /^[A-Za-z]{3}$/;

// ISO 4217 currencies whose minor-unit exponent is not the default of 2.
const ZERO_DECIMAL = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'ISK',
  'JPY',
  'KMF',
  'KRW',
  'PYG',
  'RWF',
  'UGX',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
]);

const THREE_DECIMAL = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);

/** Returns true for a well-formed ISO 4217 alphabetic code (not validated against the registry). */
export function isSupportedCurrency(code: string): boolean {
  return CODE_RE.test(code);
}

function normalizeCode(code: string): string {
  if (!CODE_RE.test(code)) {
    throw new TypeError(`Invalid ISO 4217 currency code: ${JSON.stringify(code)}`);
  }
  return code.toUpperCase();
}

/** Number of decimal digits in the currency's minor unit (default 2). */
export function currencyExponent(code: CurrencyCode): number {
  const c = normalizeCode(code);
  if (ZERO_DECIMAL.has(c)) return 0;
  if (THREE_DECIMAL.has(c)) return 3;
  return 2;
}

/**
 * Convert integer minor units to a canonical decimal string for the currency,
 * e.g. `(45000, 'CZK') -> "450.00"`, `(450, 'JPY') -> "450"`. Float-free.
 */
export function minorToDecimalString(minor: number, code: CurrencyCode): string {
  if (!Number.isInteger(minor)) {
    throw new TypeError(`minor units must be an integer, received ${minor}`);
  }
  const exp = currencyExponent(code);
  const sign = minor < 0 ? '-' : '';
  const digits = Math.abs(minor).toString();
  if (exp === 0) return sign + digits;

  const padded = digits.padStart(exp + 1, '0');
  const whole = padded.slice(0, padded.length - exp);
  const fraction = padded.slice(padded.length - exp);
  return `${sign}${whole}.${fraction}`;
}

/**
 * Parse a decimal string (with `.` or `,` as the decimal separator) into integer
 * minor units for the currency. Throws if the value carries more significant
 * decimal places than the currency supports.
 */
export function decimalStringToMinor(value: string, code: CurrencyCode): number {
  const exp = currencyExponent(code);
  const normalized = value.trim().replace(',', '.');
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) {
    throw new TypeError(`Cannot parse decimal amount: ${JSON.stringify(value)}`);
  }
  const sign = match[1] ? -1 : 1;
  const whole = match[2]!;
  let fraction = match[3] ?? '';

  if (fraction.length > exp) {
    const extra = fraction.slice(exp);
    if (/[^0]/.test(extra)) {
      throw new RangeError(
        `Amount ${JSON.stringify(value)} has more decimal places than ${code} supports (${exp})`,
      );
    }
    fraction = fraction.slice(0, exp);
  }
  fraction = fraction.padEnd(exp, '0');

  const minor = Number(whole + fraction);
  if (!Number.isSafeInteger(minor)) {
    throw new RangeError(`Amount ${JSON.stringify(value)} exceeds the safe integer range`);
  }
  return sign * minor === 0 ? 0 : sign * minor;
}
