import { describe, expect, it } from 'vitest';
import { parseCzAccount, czAccountToIban, maskCzAccount } from './cz-account.js';
import { isValidIban } from '../spayd/spayd.js';

describe('parseCzAccount', () => {
  it('parses prefix-number/bankCode', () => {
    expect(parseCzAccount('19-2000145399/0800')).toEqual({
      prefix: '19',
      number: '2000145399',
      bankCode: '0800',
    });
  });

  it('parses number/bankCode without prefix', () => {
    expect(parseCzAccount('2000145399/0800')).toEqual({
      prefix: '',
      number: '2000145399',
      bankCode: '0800',
    });
  });

  it('ignores whitespace noise', () => {
    expect(parseCzAccount(' 19 - 2000145399 / 0800 ')).not.toBeNull();
  });

  it('rejects a number failing the mod-11 checksum', () => {
    // 1000145399: weighted sum 115, 115 % 11 !== 0
    expect(parseCzAccount('1000145399/0800')).toBeNull();
  });

  it('rejects a prefix failing the mod-11 checksum', () => {
    // prefix 12: 1*2 + 2*1 = 4, 4 % 11 !== 0
    expect(parseCzAccount('12-2000145399/0800')).toBeNull();
  });

  it('rejects malformed inputs', () => {
    expect(parseCzAccount('')).toBeNull();
    expect(parseCzAccount('abc')).toBeNull();
    expect(parseCzAccount('2000145399')).toBeNull(); // missing bank code
    expect(parseCzAccount('2000145399/08000')).toBeNull(); // 5-digit bank code
    expect(parseCzAccount('2000145399/08x0')).toBeNull();
    expect(parseCzAccount('1-2000145399/0800/1')).toBeNull();
    expect(parseCzAccount('9/0800')).toBeNull(); // number must be 2–10 digits
  });
});

describe('czAccountToIban', () => {
  it('converts the reference account to the known IBAN', () => {
    // Same fixture the e2e suite asserts inside the SPAYD string.
    expect(czAccountToIban('19-2000145399/0800')).toBe('CZ6508000000192000145399');
  });

  it('produces a structurally valid IBAN for prefixless accounts', () => {
    const iban = czAccountToIban('2000145399/0800');
    expect(iban).not.toBeNull();
    expect(iban!.startsWith('CZ')).toBe(true);
    expect(iban).toHaveLength(24);
    expect(isValidIban(iban!)).toBe(true);
    expect(iban!.slice(4, 8)).toBe('0800');
    expect(iban!.endsWith('2000145399')).toBe(true);
  });

  it('returns null for invalid input', () => {
    expect(czAccountToIban('1000145399/0800')).toBeNull();
    expect(czAccountToIban('garbage')).toBeNull();
  });
});

describe('maskCzAccount', () => {
  it('masks to the last 4 digits + bank code', () => {
    expect(maskCzAccount('19-2000145399/0800')).toBe('…5399/0800');
  });

  it('returns unparseable input unchanged', () => {
    expect(maskCzAccount('nonsense')).toBe('nonsense');
  });
});
