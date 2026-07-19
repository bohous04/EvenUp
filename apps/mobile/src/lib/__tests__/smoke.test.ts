import { minorToDecimalString } from '@evenup/core';

test('core is importable from the mobile jest env', () => {
  expect(minorToDecimalString(12345, 'CZK')).toBe('123.45');
});
