/**
 * Absolute origin used to resolve `metadataBase` — and therefore every
 * relative Open Graph and Twitter image URL — into the absolute URLs that
 * social scrapers require.
 *
 * Both layouts need it (`app/layout.tsx` for the root-level OG/Twitter image
 * files, `app/[locale]/layout.tsx` for page metadata), so it lives here
 * rather than being computed twice and drifting.
 */
export const SITE_URL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
