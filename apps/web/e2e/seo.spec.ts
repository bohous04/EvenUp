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

test('sitemap lists all five marketing routes in both locales, and never /cs', async ({
  request,
}) => {
  const body = await (await request.get('/sitemap.xml')).text();
  const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(locs).toHaveLength(10);
  const origin = new URL(locs[0]).origin;
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
