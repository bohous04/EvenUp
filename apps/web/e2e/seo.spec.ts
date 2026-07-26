import { test, expect } from '@playwright/test';

/**
 * The SEO surface of the bilingual marketing site: hreflang alternates on
 * marketing pages, a sitemap listing both locales, `/robots.txt` naming it,
 * and `noindex` on the signed-in app so search engines never index
 * `/groups`, `/settings`, or — the genuine privacy concern — `/invite/<token>`.
 *
 * The landing page and the four legal documents already carry
 * `alternates.canonical`/`languages` per page (see `page.tsx` and
 * `legal-document.tsx`'s `legalMetadata`); this file is what's new:
 * `sitemap.ts`/`robots.ts` at the app root, and `robots: { index: false,
 * follow: false }` on the `(app)` layout.
 */

test('root and /en cross-reference each other with hreflang', async ({ page }) => {
  await page.goto('/');
  const cs = page.locator('link[rel="alternate"][hreflang="cs"]');
  const en = page.locator('link[rel="alternate"][hreflang="en"]');
  await expect(cs).toHaveCount(1);
  await expect(en).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
});

test('sitemap lists both locales and robots points at it', async ({ request }) => {
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  const body = await sitemap.text();
  expect(body).toContain('/en');
  const robots = await request.get('/robots.txt');
  expect(await robots.text()).toContain('Sitemap');
});

/**
 * The origin has to come from the *request*, never from the sitemap's own
 * first `<loc>` — deriving it from the body is how this file used to agree
 * with itself no matter what the server emitted, and it let a build that
 * baked `http://localhost:3000` into all ten URLs pass unnoticed.
 */
test('sitemap and robots use the request origin, not a build-time one', async ({ request }) => {
  const res = await request.get('/sitemap.xml');
  const origin = new URL(res.url()).origin;
  const locs = [...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(locs).toHaveLength(10);
  for (const loc of locs) expect(new URL(loc!).origin).toBe(origin);

  const robots = await request.get('/robots.txt');
  expect(await robots.text()).toContain(`Sitemap: ${new URL(robots.url()).origin}/sitemap.xml`);
});

/**
 * The invariant that actually matters: every URL the sitemap advertises must
 * canonicalise to itself. A sitemap listing origin A while the pages it points
 * at declare canonical B is the "submitted URL not selected as canonical"
 * failure — the precise thing a sitemap exists to prevent.
 *
 * This also pins that a spoofed `x-forwarded-host` cannot rewrite what a
 * crawler is told: with `BETTER_AUTH_URL` configured, the header is ignored.
 */
test('sitemap URLs agree with the canonical the pages declare', async ({ request, page }) => {
  const spoofed = { 'x-forwarded-host': 'evenup.example', 'x-forwarded-proto': 'https' };
  const body = await (await request.get('/sitemap.xml', { headers: spoofed })).text();
  const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(locs).toHaveLength(10);
  expect(locs.some((l) => l!.includes('evenup.example'))).toBe(false);

  await page.goto('/en/terms');
  const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
  expect(locs).toContain(canonical);
  expect(new URL(canonical!).origin).toBe(new URL(locs[0]!).origin);
});

test('sitemap lists all five marketing routes in both locales, and never /cs', async ({
  request,
}) => {
  const res = await request.get('/sitemap.xml');
  const body = await res.text();
  const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(locs).toHaveLength(10);
  const origin = new URL(res.url()).origin;
  for (const slug of ['terms', 'privacy', 'refunds', 'contact']) {
    expect(locs).toContain(`${origin}/${slug}`);
    expect(locs).toContain(`${origin}/en/${slug}`);
  }
  expect(locs).toContain(`${origin}/`);
  expect(locs).toContain(`${origin}/en`);
  expect(locs.some((l) => l.includes('/cs'))).toBe(false);
});

test('the signed-in app is served noindex, nofollow in the raw HTML', async ({ request }) => {
  // /sign-up needs no auth to render, unlike /groups or /settings, so it is a
  // reliable unauthenticated probe for what a crawler would actually see.
  const cs = await (await request.get('/sign-up')).text();
  expect(cs).toMatch(/<meta name="robots" content="[^"]*noindex[^"]*"/);
  expect(cs).toMatch(/<meta name="robots" content="[^"]*nofollow[^"]*"/);

  const en = await (await request.get('/en/sign-up')).text();
  expect(en).toMatch(/<meta name="robots" content="[^"]*noindex[^"]*"/);
});

test('marketing pages carry no robots meta tag and stay indexable', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);

  await page.goto('/terms');
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
});
