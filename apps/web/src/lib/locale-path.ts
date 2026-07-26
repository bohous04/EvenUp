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

/**
 * Builds the target URL for a locale switch, preserving the query string and
 * hash. `usePathname()` (the header's only other option) strips both, so a
 * switch from e.g. `/reset-password?token=…` silently dropped the token and
 * dead-ended the reset flow — switch languages on `/sign-up?callbackURL=…`
 * or `/verify-email/pending?email=…` and the same thing happened. Read
 * `search`/`hash` from `window.location` at the call site instead of pulling
 * in `useSearchParams()`, which would force every prerendered route out of
 * static generation unless wrapped in Suspense.
 */
export function localizedUrl(
  pathname: string,
  search: string,
  hash: string,
  locale: Locale,
): string {
  return `${localizedPath(pathname, locale)}${search}${hash}`;
}
