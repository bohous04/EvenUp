import { clampAmountDecimals } from '../AmountInput';

test('clamps CZK to 2 decimals', () => {
  expect(clampAmountDecimals('12,345', 'CZK')).toBe('12,34');
});
test('accepts a dot separator and a trailing separator mid-type', () => {
  expect(clampAmountDecimals('12.', 'CZK')).toBe('12.');
});
test('zero-decimal currency drops the separator', () => {
  expect(clampAmountDecimals('12,5', 'JPY')).toBe('12');
});
test('no separator passes through unchanged', () => {
  expect(clampAmountDecimals('1234', 'CZK')).toBe('1234');
});
