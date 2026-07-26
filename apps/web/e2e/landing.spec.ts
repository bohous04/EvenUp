import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Copy under test, duplicated from `packages/i18n/src/locales/marketing.ts`.
 * Playwright's loader resolves neither the workspace package's `.js`-suffixed
 * source specifiers nor its `exports` map, so the catalog cannot be imported
 * here; key parity and non-emptiness are covered by `marketing.test.ts` in
 * that package instead. Keep these two strings in step with the catalog.
 */
const CS_HERO = 'Vyrovnejte se na co nejmíň převodů';
const EN_HERO = 'Settle up in the fewest payments';

test('serves the Czech landing page server-side at the root', async ({ page }) => {
  const res = await page.goto('/');
  expect(res?.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
});

test('serves English at /en with the right lang attribute', async ({ page }) => {
  await page.goto('/en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('renders translated copy WITHOUT javascript — this is the whole point', async ({
  browser,
}) => {
  // If this fails, crawlers see one language and users see a flash of the
  // wrong one, which is exactly what the routing change exists to prevent.
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('/en');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('h1')).toHaveText(EN_HERO);
  await ctx.close();
});

/**
 * The tests above can pass on markup React injects during hydration — the 404
 * page used to do exactly that: blank without JS, because its content lived
 * only in the RSC flight payload. This one asserts on the raw response body,
 * before any browser touches it, so a regression to a client component is
 * caught rather than papered over.
 */
test('the copy is in the server HTML itself, per locale', async ({ request }) => {
  const cs = await (await request.get('/')).text();
  expect(cs).toContain(CS_HERO);
  expect(cs).not.toContain(EN_HERO);

  const en = await (await request.get('/en')).text();
  expect(en).toContain(EN_HERO);
  expect(en).not.toContain(CS_HERO);
});

test('prices the landing page in the locale currency', async ({ page }) => {
  // Czech pages are priced in CZK, everything else in EUR
  // (`currencyForLocale`); the amounts come from `display-prices.ts` and are
  // rendered through `formatCurrency`, never written into the copy.
  await page.goto('/');
  const pricing = page.getByTestId('pricing');
  await expect(pricing).toContainText('Kč');
  await expect(pricing).toContainText('50');

  await page.goto('/en');
  await expect(page.getByTestId('pricing')).toContainText('€');
});

test('the landing page is the front door to the app, not the app itself', async ({ page }) => {
  await page.goto('/');
  // No app chrome: the signed-in header (settings / sign-out / admin) belongs
  // to the `(app)` route group, not here.
  await expect(page.getByTestId('new-group-btn')).toHaveCount(0);

  await page.getByTestId('landing-signin').click();
  await expect(page).toHaveURL(/\/groups$/);
  await expect(page.getByTestId('signin-submit')).toBeVisible();
});

test('the landing page is accessible (§9.4)', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
});

/**
 * The app's header/content-column/service-worker moved out of
 * `app/[locale]/layout.tsx` (which the landing page also inherits) and into
 * `(app)/layout.tsx`. Next renders a not-found boundary with its own segment's
 * layouts only, never a sibling route group's, so `not-found.tsx` had to ask
 * for that chrome itself — this is the regression guard for that.
 */
test('a 404 keeps the app chrome after the chrome moved into the (app) group', async ({ page }) => {
  const res = await page.goto('/nonexistent-page');
  expect(res?.status()).toBe(404);
  // The app header's logo — its accessible name is `app.name`, "dlužníček".
  await expect(page.getByRole('link', { name: 'dlužníček' })).toBeVisible();
  await expect(page.getByRole('group', { name: /jazyk|language/i })).toBeVisible();
});
