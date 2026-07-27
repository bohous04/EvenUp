import { notFound } from 'next/navigation';
import { LOCALES, type Locale } from '@evenup/i18n';

function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * Narrow a raw `[locale]` route param to a real `Locale`, 404-ing on anything
 * else. A type-predicate guard rather than a bare `as Locale` cast, so the
 * narrowing is verified rather than asserted — without it, `/xx/groups` would
 * render with a bogus `lang` attribute and translate against a missing
 * catalog.
 *
 * Shared by every server component that reads the segment (the root layout,
 * the marketing layout and page) so the check cannot drift between them.
 */
export function resolveLocale(value: string): Locale {
  if (!isLocale(value)) notFound();
  return value;
}
