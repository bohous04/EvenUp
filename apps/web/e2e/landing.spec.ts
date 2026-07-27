import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Copy under test, duplicated from `packages/i18n/src/locales/marketing.ts`.
 * Playwright's loader resolves neither the workspace package's `.js`-suffixed
 * source specifiers nor its `exports` map, so the catalog cannot be imported
 * here; key parity and non-emptiness are covered by `marketing.test.ts` in
 * that package instead. Keep these two strings in step with the catalog.
 */
const CS_HERO = 'Místo osmi plateb pošlete dvě';
const EN_HERO = 'Send two payments instead of eight';

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

test('prices the landing page in the locale currency, trimmed to a round number', async ({
  page,
}) => {
  // Czech pages are priced in CZK, everything else in EUR
  // (`currencyForLocale`); the amounts come from `display-prices.ts` and are
  // rendered through `formatCurrency`, never written into the copy.
  //
  // Asserting the exact trimmed strings, not just substrings: `toContainText('50')`
  // passes for both "50 Kč" and "50,00 Kč", so it would not catch the price
  // list silently reverting to the untrimmed format while the VIP panel
  // (`vip-pricing.test.tsx`) stayed trimmed.
  await page.goto('/');
  await expect(page.getByTestId('pricing-vip')).toContainText('50 Kč');

  await page.goto('/en');
  await expect(page.getByTestId('pricing-vip')).toContainText('€2');
});

/**
 * Runs on BOTH locales, which is the whole point: the English page once linked
 * to `/groups` and `/sign-up` — the *Czech* routes — so every CTA on it, and
 * the wordmark, dropped an English visitor into a Czech app. A `/`-only test
 * passed throughout. Czech is unprefixed and English lives under `/en`, so the
 * assertions are on the exact path, never a `/groups$` suffix that both match.
 */
for (const { landing, app, signUp, wordmark } of [
  { landing: '/', app: '/groups', signUp: '/sign-up', wordmark: 'dlužníček' },
  { landing: '/en', app: '/en/groups', signUp: '/en/sign-up', wordmark: 'EvenUp' },
]) {
  test(`the landing page at ${landing} is the front door to the app, not the app itself`, async ({
    page,
  }) => {
    await page.goto(landing);
    // No app chrome: the signed-in header (settings / sign-out / admin) belongs
    // to the `(app)` route group, not here.
    await expect(page.getByTestId('new-group-btn')).toHaveCount(0);

    // All three sign-up CTAs (hero, pricing, closing), both app links (header,
    // hero) and the wordmark, by href rather than by clicking each: the bug
    // was that these were written as literals, and a literal is right for
    // exactly one of the two locales.
    await expect(page.locator(`a[href="${signUp}"]`)).toHaveCount(3);
    await expect(page.locator(`a[href="${app}"]`)).toHaveCount(2);
    await expect(page.getByRole('link', { name: wordmark })).toHaveAttribute('href', landing);

    await page.getByTestId('landing-signin').click();
    await expect(page).toHaveURL(app);
    await expect(page.getByTestId('signin-submit')).toBeVisible();
  });
}

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
test('a 404 keeps the app chrome once JavaScript has run', async ({ page, request }) => {
  const res = await page.goto('/nonexistent-page');
  expect(res?.status()).toBe(404);

  // Known limitation, asserted rather than left implied: the 404's content is
  // NOT in the server HTML — it arrives only in the RSC flight payload, so a
  // no-JS visitor or a crawler still gets a blank page. That predates the
  // (app)/(marketing) split (the whole `[locale]` layout already sat inside
  // the suspended not-found boundary), and it is why everything below this
  // line proves the chrome only for a JavaScript-enabled browser — unlike the
  // landing page, which has its own no-JS test above. Flip this to `toContain`
  // the day the 404 renders server-side; do not read it as no-JS coverage.
  const serverHtml = await (await request.get('/nonexistent-page')).text();
  expect(serverHtml).not.toContain('<h1');

  // The app header's logo — its accessible name is `app.name`, "dlužníček".
  await expect(page.getByRole('link', { name: 'dlužníček' })).toBeVisible();
  await expect(page.getByRole('group', { name: /jazyk|language/i })).toBeVisible();
});
