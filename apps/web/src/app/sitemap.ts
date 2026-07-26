import type { MetadataRoute } from 'next';
import { requestOrigin } from '@/lib/site-url';

/**
 * The five marketing routes, in both locales — the ten URLs a search engine
 * should actually crawl. Czech is unprefixed (`/terms`) and English lives
 * under `/en` (`/en/terms`); `/cs/...` 308-redirects (see `middleware.ts`'s
 * `DEFAULT_LOCALE` handling), so it must never appear here — a sitemap entry
 * that immediately redirects trains crawlers to distrust the rest of the
 * file.
 *
 * The signed-in app (`(app)` route group — `/groups`, `/settings`,
 * `/invite/<token>`, etc.) is deliberately absent: those routes carry
 * `robots: { index: false, follow: false }` from
 * `app/[locale]/(app)/layout.tsx`, so listing them here would contradict that
 * and hand a crawler URLs — `/invite/<token>` chief among them — it was just
 * told not to index. `/vip` is absent for the same reason and stays that way:
 * it is an account page in `(app)`, and the public pricing story lives on the
 * landing page, which *is* listed.
 */
const MARKETING_SLUGS = ['', 'terms', 'privacy', 'refunds', 'contact'] as const;

/**
 * Lives at the true app root (`apps/web/src/app/`), not inside `[locale]`:
 * the middleware's `HAS_FILE_EXTENSION` guard skips the locale rewrite for
 * any path with a file extension, so a `sitemap.ts` nested under `[locale]`
 * would never be reachable at `/sitemap.xml`. `app/layout.tsx` (the
 * metadata-only root layout) exists for the same structural reason.
 */

/**
 * Rendered per request. Every `<loc>` here is an absolute URL, and building
 * them from the module-scope `SITE_URL` meant baking in whatever
 * `BETTER_AUTH_URL` held at `next build` — so a container built without it
 * and configured at runtime (the Coolify/Docker norm) served ten
 * `http://localhost:3000` URLs to Google. See `requestOrigin()` for why the
 * request's own host is the right source, and `robots.ts` for the sibling
 * fix.
 */
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await requestOrigin();
  return MARKETING_SLUGS.flatMap((slug) => {
    const cs = `${origin}${slug === '' ? '/' : `/${slug}`}`;
    const en = `${origin}${slug === '' ? '/en' : `/en/${slug}`}`;
    const alternates = { languages: { cs, en } };
    return [
      { url: cs, alternates },
      { url: en, alternates },
    ];
  });
}
