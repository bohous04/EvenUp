import { resolveInitialLocale } from '../resolve-locale';

test('prefers a valid stored locale', () => {
  expect(resolveInitialLocale('en', 'cs-CZ')).toBe('en');
});
test('falls back to device language when nothing stored', () => {
  expect(resolveInitialLocale(null, 'en-US')).toBe('en');
});
test('defaults to Czech for unknown/empty inputs', () => {
  expect(resolveInitialLocale(null, null)).toBe('cs');
  expect(resolveInitialLocale('xx', 'fr-FR')).toBe('cs');
});
