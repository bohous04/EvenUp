import type { MetadataRoute } from 'next';
import { requestOrigin } from '@/lib/site-url';

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

/**
 * Rendered per request, not prerendered. The `Sitemap:` line is an absolute
 * URL, and this route used to build it from the module-scope `SITE_URL` —
 * i.e. from whatever `BETTER_AUTH_URL` was set to at `next build`. Every
 * deploy that supplies that variable at runtime only (the Coolify/Docker
 * norm) therefore shipped `Sitemap: http://localhost:3000/sitemap.xml`.
 * `requestOrigin()` reads `next/headers`, which already forces this route
 * dynamic; the explicit flag states the intent so a future refactor that
 * drops the header read doesn't silently re-bake the origin.
 */
export const dynamic = 'force-dynamic';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await requestOrigin();
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${origin}/sitemap.xml`,
  };
}
