/**
 * Czech domestic bank account numbers ("[prefix-]number/bankCode") — parsing
 * with the ČNB mod-11 weighted checksums, conversion to IBAN, and a display
 * mask. IBAN is an internal detail of SPAYD QR payloads and never surfaces in
 * the UI (design decision 2026-07-09).
 */

export interface CzAccount {
  prefix: string;
  number: string;
  bankCode: string;
}

/** ČNB weights, applied to the zero-padded digits left-to-right. */
const PREFIX_WEIGHTS = [10, 5, 8, 4, 2, 1];
const NUMBER_WEIGHTS = [6, 3, 7, 9, 10, 5, 8, 4, 2, 1];

function mod11Ok(digits: string, weights: number[]): boolean {
  const padded = digits.padStart(weights.length, '0');
  const sum = [...padded].reduce((acc, ch, i) => acc + Number(ch) * weights[i]!, 0);
  return sum % 11 === 0;
}

export function parseCzAccount(input: string): CzAccount | null {
  const compact = input.replace(/\s+/g, '');
  const match = /^(?:(\d{1,6})-)?(\d{2,10})\/(\d{4})$/.exec(compact);
  if (!match) return null;
  const [, prefix = '', number, bankCode] = match;
  if (!mod11Ok(prefix || '0', PREFIX_WEIGHTS)) return null;
  if (!mod11Ok(number!, NUMBER_WEIGHTS)) return null;
  return { prefix, number: number!, bankCode: bankCode! };
}

/** Compact uppercase CZ IBAN (mod-97 check digits), or null when invalid. */
export function czAccountToIban(input: string): string | null {
  const account = parseCzAccount(input);
  if (!account) return null;
  const bban = account.bankCode + account.prefix.padStart(6, '0') + account.number.padStart(10, '0');
  // Check digits: move "CZ00" behind the BBAN, letters → numbers (C=12, Z=35),
  // then 98 - (big number mod 97). BigInt keeps the 30-digit arithmetic exact.
  const numeric = `${bban}123500`; // C→12, Z→35, 0, 0
  const check = 98n - (BigInt(numeric) % 97n);
  return `CZ${check.toString().padStart(2, '0')}${bban}`;
}

/** Display mask for the settings page: `…5399/0800`. */
export function maskCzAccount(input: string): string {
  const account = parseCzAccount(input);
  if (!account) return input;
  return `…${account.number.slice(-4)}/${account.bankCode}`;
}
