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
 * Read at **module scope**, which means at `next build` time for anything
 * prerendered — so `BETTER_AUTH_URL` is a build-time-significant variable
 * (documented as such in `.env.example`, alongside the `LEGAL_*` block that
 * carries the same warning). Routes that must not bake it in use
 * `requestOrigin()` below instead.
 */
export const SITE_URL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';

/**
 * The origin of the incoming request, for routes whose whole output is a list
 * of absolute URLs — `/sitemap.xml` and `/robots.txt`.
 *
 * Those two must NOT bake `SITE_URL` in. Both are prerendered by default, so
 * on any deploy where `BETTER_AUTH_URL` is supplied at runtime only — the
 * Coolify/Docker norm, since the image is built once and configured per
 * environment — the build reads the fallback and ships a sitemap of
 * `http://localhost:3000` URLs to Google. Reading the request's own host
 * instead makes the two routes correct wherever the container is served from,
 * with no build-time coupling at all.
 *
 * `x-forwarded-host`/`x-forwarded-proto` win over `Host` because production
 * sits behind a reverse proxy (Traefik in Coolify) that terminates TLS: the
 * `Host` the app sees is right, but the scheme it was served over is only
 * knowable from the forwarded header. A comma-separated forwarded value (a
 * chain of proxies) contributes its first, client-most entry.
 *
 * Falls back to `SITE_URL` if a request somehow carries no host header at all
 * — a sitemap with the configured origin beats one with no origin.
 */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const first = (value: string | null) => value?.split(',')[0]?.trim() || null;
  const host = first(h.get('x-forwarded-host')) ?? first(h.get('host'));
  if (!host) return SITE_URL;
  const proto =
    first(h.get('x-forwarded-proto')) ??
    (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}
