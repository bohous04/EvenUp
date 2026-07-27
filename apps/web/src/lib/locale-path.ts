import { LOCALES, type Locale } from '@evenup/i18n';

/**
 * Strip a leading locale segment, leaving the path as a visitor sees it.
 *
 * BOTH prefixes are stripped, not only `/en`. `/cs/…` never appears in the
 * address bar — the middleware 308s it to the unprefixed form — but it *is*
 * the internal path the app is rewritten onto, and therefore what
 * `usePathname()` reports while a Czech route is being prerendered. Handling
 * it here means the marketing locale switch derives identical hrefs from the
 * prerendered path (`/cs/privacy`) and from the browser's path (`/privacy`),
 * so there is nothing for hydration to disagree about.
 *
 * The prefix is matched on a segment boundary — exactly `/en` or a leading
 * `/en/` — never `startsWith('/en')`, so `/enterprise` isn't mistaken for the
 * English locale segment.
 */
export function unlocalizedPath(pathname: string): string {
  for (const locale of LOCALES) {
    const prefix = `/${locale}`;
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return pathname.slice(prefix.length) || '/';
    }
  }
  return pathname;
}

/**
 * Czech is the unprefixed default (see `middleware.ts`), so switching to `cs`
 * strips the locale segment and switching to `en` adds `/en`.
 */
export function localizedPath(pathname: string, locale: Locale): string {
  const bare = unlocalizedPath(pathname);

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
