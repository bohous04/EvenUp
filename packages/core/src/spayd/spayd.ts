/**
 * SPAYD ("Short Payment Descriptor" / Czech "QR Platba") generation. (§16.1, FR-7.1)
 *
 * The descriptor is a `*`-delimited list of `KEY:VALUE` attributes that Czech
 * banking apps parse to prefill a transfer. EvenUp builds the string here; the
 * QR rendering happens client-side.
 */

import { currencyExponent, minorToDecimalString, type CurrencyCode } from '../money/currency.js';

const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/;

/** Remove spaces and upper-case an IBAN. */
export function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, '').toUpperCase();
}

/** Validate an IBAN: structure plus the ISO 7064 mod-97 checksum. */
export function isValidIban(iban: string): boolean {
  const normalized = normalizeIban(iban);
  if (!IBAN_RE.test(normalized) || normalized.length < 5) return false;

  // Move the first four chars to the end, then map letters to numbers (A=10..Z=35).
  const rearranged = normalized.slice(4) + normalized.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    const value = code >= 65 ? code - 55 : code - 48; // A-Z -> 10-35, 0-9 -> 0-9
    remainder = (remainder * (value > 9 ? 100 : 10) + value) % 97;
  }
  return remainder === 1;
}

/** Convert an ISO `YYYY-MM-DD` (or already-compact `YYYYMMDD`) date to SPAYD `YYYYMMDD`. */
export function formatSpaydDate(date: string): string {
  const compact = date.replace(/-/g, '');
  if (!/^\d{8}$/.test(compact)) {
    throw new TypeError(`Invalid SPAYD date: ${JSON.stringify(date)} (expected YYYY-MM-DD)`);
  }
  const month = Number(compact.slice(4, 6));
  const day = Number(compact.slice(6, 8));
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new RangeError(`Invalid SPAYD date: ${JSON.stringify(date)}`);
  }
  return compact;
}

/** Sanitize a value for inclusion in a SPAYD descriptor (strip diacritics, escape reserved chars). */
function sanitizeValue(value: string, maxLength: number): string {
  const stripped = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let out = '';
  for (const ch of stripped) {
    const code = ch.codePointAt(0)!;
    if (ch === '*' || ch === '%') {
      out += '%' + code.toString(16).toUpperCase().padStart(2, '0');
    } else if (code < 0x20) {
      continue; // drop control characters
    } else if (code > 0x7e) {
      for (const byte of new TextEncoder().encode(ch)) {
        out += '%' + byte.toString(16).toUpperCase().padStart(2, '0');
      }
    } else {
      out += ch;
    }
  }
  return out.length > maxLength ? out.slice(0, maxLength) : out;
}

export interface SpaydInput {
  readonly iban: string;
  readonly bic?: string;
  readonly amountMinorUnits?: number;
  readonly currency?: CurrencyCode;
  readonly message?: string;
  readonly recipientName?: string;
  /** ISO `YYYY-MM-DD` or compact `YYYYMMDD`. */
  readonly date?: string;
  readonly variableSymbol?: string;
  readonly specificSymbol?: string;
  readonly constantSymbol?: string;
  /** Payment reference (RF). */
  readonly reference?: string;
}

function assertSymbol(value: string, label: string, maxLength: number): string {
  if (!/^\d+$/.test(value) || value.length > maxLength) {
    throw new RangeError(
      `${label} must be up to ${maxLength} digits, received ${JSON.stringify(value)}`,
    );
  }
  return value;
}

/**
 * Build a SPAYD 1.0 descriptor string. Only the IBAN is required; an amount, if
 * supplied, requires a currency so it can be formatted with the right exponent.
 */
export function buildSpayd(input: SpaydInput): string {
  const iban = normalizeIban(input.iban);
  if (!IBAN_RE.test(iban)) {
    throw new TypeError(`Invalid IBAN: ${JSON.stringify(input.iban)}`);
  }

  const attrs: string[] = ['SPD', '1.0'];

  const acc = input.bic ? `${iban}+${input.bic.replace(/\s+/g, '').toUpperCase()}` : iban;
  attrs.push(`ACC:${acc}`);

  if (input.amountMinorUnits !== undefined) {
    if (!input.currency) {
      throw new TypeError('An amount requires a currency to format it correctly');
    }
    attrs.push(`AM:${minorToDecimalString(input.amountMinorUnits, input.currency)}`);
  }
  if (input.currency) {
    // CC carries the currency's minor-unit scale implicitly; validate it parses.
    currencyExponent(input.currency);
    attrs.push(`CC:${input.currency.toUpperCase()}`);
  }
  if (input.reference !== undefined) {
    attrs.push(`RF:${sanitizeValue(input.reference, 16)}`);
  }
  if (input.recipientName !== undefined) {
    attrs.push(`RN:${sanitizeValue(input.recipientName, 35)}`);
  }
  if (input.date !== undefined) {
    attrs.push(`DT:${formatSpaydDate(input.date)}`);
  }
  if (input.message !== undefined) {
    attrs.push(`MSG:${sanitizeValue(input.message, 60)}`);
  }
  if (input.variableSymbol !== undefined) {
    attrs.push(`X-VS:${assertSymbol(input.variableSymbol, 'Variable symbol', 10)}`);
  }
  if (input.specificSymbol !== undefined) {
    attrs.push(`X-SS:${assertSymbol(input.specificSymbol, 'Specific symbol', 10)}`);
  }
  if (input.constantSymbol !== undefined) {
    attrs.push(`X-KS:${assertSymbol(input.constantSymbol, 'Constant symbol', 10)}`);
  }

  return attrs.join('*');
}
