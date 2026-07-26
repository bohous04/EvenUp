import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site-url';

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
 * told not to index.
 */
const MARKETING_SLUGS = ['', 'terms', 'privacy', 'refunds', 'contact'] as const;

/**
 * Lives at the true app root (`apps/web/src/app/`), not inside `[locale]`:
 * the middleware's `HAS_FILE_EXTENSION` guard skips the locale rewrite for
 * any path with a file extension, so a `sitemap.ts` nested under `[locale]`
 * would never be reachable at `/sitemap.xml`. `app/layout.tsx` (the
 * metadata-only root layout) exists for the same structural reason.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return MARKETING_SLUGS.flatMap((slug) => {
    const cs = `${SITE_URL}${slug === '' ? '/' : `/${slug}`}`;
    const en = `${SITE_URL}${slug === '' ? '/en' : `/en/${slug}`}`;
    const alternates = { languages: { cs, en } };
    return [
      { url: cs, alternates },
      { url: en, alternates },
    ];
  });
}
