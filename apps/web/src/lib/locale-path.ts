import type { Locale } from '@evenup/i18n';

/**
 * Czech is the unprefixed default (see `middleware.ts`), so switching to
 * `cs` strips a leading `/en` and switching to `en` adds it. The prefix is
 * matched on a segment boundary — exactly `/en` or a leading `/en/` — never
 * `startsWith('/en')`, so `/enterprise` isn't mistaken for the English
 * locale segment.
 */
export function localizedPath(pathname: string, locale: Locale): string {
  const isEnglish = pathname === '/en' || pathname.startsWith('/en/');
  const bare = isEnglish ? pathname.slice('/en'.length) || '/' : pathname;

  if (locale === 'en') {
    return bare === '/' ? '/en' : `/en${bare}`;
  }
  return bare;
}
