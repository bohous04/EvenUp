import { NextResponse, type NextRequest } from 'next/server';

const DEFAULT_LOCALE = 'cs';

/**
 * Everything the middleware must NOT touch. Rewriting `/api/auth/*` or
 * `/api/trpc/*` breaks authentication and every tRPC call — this is the
 * highest-risk decision in the routing change, so it is enforced twice: here,
 * where a unit test can prove it, and again in `config.matcher` below, so the
 * work is skipped entirely at the edge. Both checks require a segment
 * boundary (`/api` or `/api/...`, never merely a path that *starts with* the
 * string "api"), so `/apifoo` and `/api-docs` are correctly left alone by
 * both — the two are kept in sync on purpose.
 */
const EXCLUDED_PREFIXES = ['/api', '/_next'] as const;
const EXCLUDED_PATHS = ['/sw.js', '/manifest.webmanifest'] as const;
/**
 * Mirrors the matcher's `.*\.[a-zA-Z0-9]+$`; the `i` flag covers uppercase
 * extensions (e.g. `/Icon.PNG`) that a case-sensitive form would miss on
 * both sides, leaving it to rewrite to `/cs/Icon.PNG` and 404.
 *
 * Any dot anywhere in the path — including inside a dynamic segment — makes
 * that path skip the locale rewrite entirely, so e.g. `/invite/tok.en` would
 * fall through and 404. That's safe *today* only because invite tokens are
 * `randomBytes(18).toString('base64url')` (packages/api/src/routers/invite.ts)
 * — alphabet `A-Za-z0-9-_`, no dot — and ids are `@default(cuid())`, also
 * dot-free. If either alphabet ever grows a `.`, this exclusion needs to
 * change too.
 */
const HAS_FILE_EXTENSION = /\.[a-z0-9]+$/i;

function isExcluded(pathname: string): boolean {
  if (EXCLUDED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
  if ((EXCLUDED_PATHS as readonly string[]).includes(pathname)) return true;
  return HAS_FILE_EXTENSION.test(pathname);
}

/**
 * Czech is the unprefixed default (`/groups`); English lives under `/en`.
 * Keeping Czech unprefixed is what lets the `/invite/<token>` links already in
 * circulation keep working unchanged.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (isExcluded(pathname)) return NextResponse.next();

  // One canonical URL per page: the explicit default prefix redirects away.
  if (pathname === `/${DEFAULT_LOCALE}` || pathname.startsWith(`/${DEFAULT_LOCALE}/`)) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice(`/${DEFAULT_LOCALE}`.length) || '/';
    return NextResponse.redirect(url, 308);
  }

  // `/cs` (and `/cs/...`) already returned above, so `en` is the only other
  // prefix left to recognize.
  const isEnglish = pathname === '/en' || pathname.startsWith('/en/');
  const locale = isEnglish ? 'en' : DEFAULT_LOCALE;

  const url = req.nextUrl.clone();
  url.pathname = isEnglish ? pathname : `/${DEFAULT_LOCALE}${pathname}`;
  url.search = search;

  // `app/[locale]/not-found.tsx` is a Next.js special file that receives no
  // `params`, even though it's nested under the `[locale]` segment — this
  // request header is the only channel it has to recover which locale was
  // resolved, read back server-side via `next/headers`.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-evenup-locale', locale);

  return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
}

/**
 * Mirrors `isExcluded` above using regex alternation instead of array checks.
 * `api/` and `api$` (rather than a bare `api`) require the same segment
 * boundary the guard enforces, so `/api-docs` or `/apifoo` are correctly left
 * alone by both, and `.*\.[a-zA-Z0-9]+$` matches the guard's case-insensitive
 * file-extension check. The two must stay in sync.
 */
export const config = {
  matcher: ['/((?!api/|api$|_next/|_next$|sw\\.js$|manifest\\.webmanifest$|.*\\.[a-zA-Z0-9]+$).*)'],
};
