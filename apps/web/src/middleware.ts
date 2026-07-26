import { NextResponse, type NextRequest } from 'next/server';

const LOCALES = ['cs', 'en'] as const;
const DEFAULT_LOCALE = 'cs';

/**
 * Everything the middleware must NOT touch. Rewriting `/api/auth/*` or
 * `/api/trpc/*` breaks authentication and every tRPC call — this is the
 * highest-risk decision in the routing change, so it is enforced twice: here,
 * where a unit test can prove it, and again in `config.matcher` below, so the
 * work is skipped entirely at the edge. The two must stay in sync.
 */
const EXCLUDED_PREFIXES = ['/api', '/_next'] as const;
const EXCLUDED_PATHS = ['/sw.js', '/manifest.webmanifest'] as const;
/** Mirrors the matcher's `.*\.[a-z0-9]+$` — any static file keeps its own URL. */
const HAS_FILE_EXTENSION = /\.[a-z0-9]+$/;

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

  const hasLocale = LOCALES.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`));
  const url = req.nextUrl.clone();
  url.pathname = hasLocale ? pathname : `/${DEFAULT_LOCALE}${pathname}`;
  url.search = search;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ['/((?!api|_next|sw\\.js|manifest\\.webmanifest|.*\\.[a-z0-9]+$).*)'],
};
