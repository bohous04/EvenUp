import { describe, it, expect } from 'vitest';
import { resolveReceiptPage } from './receipt-page';

describe('resolveReceiptPage', () => {
  it('defaults to 0 when the param is missing or invalid', () => {
    expect(resolveReceiptPage(3, null)).toBe(0);
    expect(resolveReceiptPage(3, 'abc')).toBe(0);
    expect(resolveReceiptPage(3, '-2')).toBe(0);
  });
  it('returns the requested page when in range', () => {
    expect(resolveReceiptPage(3, '1')).toBe(1);
  });
  it('clamps to the last page when out of range', () => {
    expect(resolveReceiptPage(3, '9')).toBe(2);
  });
});
