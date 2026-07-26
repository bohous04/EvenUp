import { headers } from 'next/headers';

/**
 * Absolute origin used to resolve `metadataBase` — and therefore every
 * relative Open Graph and Twitter image URL — into the absolute URLs that
 * social scrapers require.
 *
 * Both layouts need it (`app/layout.tsx` for the root-level OG/Twitter image
 * files, `app/[locale]/layout.tsx` for page metadata), so it lives here
 * rather than being computed twice and drifting.
 *
 * Read at module scope, but that is *not* build-time: the value comes from the
 * running server process, so even statically prerendered pages emit whatever
 * `BETTER_AUTH_URL` is set to at runtime. Verified by building with one origin
 * and serving with another — the served canonicals carry the serving value.
 */
export const SITE_URL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';

/**
 * Origin for the two routes whose entire output is a list of absolute URLs —
 * `/sitemap.xml` and `/robots.txt`. Both are `force-dynamic`, so this is
 * evaluated per request.
 *
 * The configured origin wins whenever there is one. That is the origin every
 * canonical link on the site already uses, and a sitemap whose URLs
 * canonicalise somewhere else is worse than no sitemap — it is exactly the
 * "submitted URL not selected as canonical" failure a sitemap exists to
 * avoid. It also means no request header is trusted in a configured
 * deployment: a spoofed `x-forwarded-host` cannot change what a crawler is
 * told.
 *
 * Only when `BETTER_AUTH_URL` is unset do we fall back to the request's own
 * host, so an unconfigured deployment still emits a coherent sitemap rather
 * than one full of `http://localhost:3000`. `x-forwarded-*` wins over `Host`
 * there because the scheme is only knowable from the forwarded header behind a
 * TLS-terminating proxy; a comma-separated chain contributes its first,
 * client-most entry.
 */
export async function requestOrigin(): Promise<string> {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  const h = await headers();
  const first = (value: string | null) => value?.split(',')[0]?.trim() || null;
  const host = first(h.get('x-forwarded-host')) ?? first(h.get('host'));
  if (!host) return SITE_URL;
  const proto =
    first(h.get('x-forwarded-proto')) ??
    (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}
