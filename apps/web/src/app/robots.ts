import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site-url';

/**
 * Allows crawling generally and points at the sitemap; the signed-in app
 * doesn't need a `disallow` rule here because it already carries
 * `robots: { index: false, follow: false }` per-page (from
 * `app/[locale]/(app)/layout.tsx`), which is the more reliable signal — a
 * `disallow` merely asks crawlers not to *fetch* a URL, so a page linked from
 * elsewhere can still be indexed by URL alone, while the meta tag governs
 * indexing directly.
 *
 * Lives at the true app root, alongside `sitemap.ts`, for the same reason:
 * the middleware's file-extension guard means a `robots.ts` nested under
 * `[locale]` would never be reachable at `/robots.txt`.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
