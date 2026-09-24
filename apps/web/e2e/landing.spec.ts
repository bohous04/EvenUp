import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Copy under test, duplicated from `packages/i18n/src/locales/marketing.ts`.
 * Playwright's loader resolves neither the workspace package's `.js`-suffixed
 * source specifiers nor its `exports` map, so the catalog cannot be imported
 * here; key parity and non-emptiness are covered by `marketing.test.ts` in
 * that package instead. Keep these two strings in step with the catalog.
 */
const CS_HERO = 'Dva dluhy se zruší.';
const EN_HERO = 'Two debts cancel out.';

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
  // The h1 is two lines — a claim and its payoff — so this asserts the headline
  // is present rather than that it is the only text. Exact equality would break
  // every time a second line is added, for a reason unrelated to the language
  // routing this test actually protects.
  await expect(page.locator('h1')).toContainText(EN_HERO);
  // ...and that the *Czech* headline did not leak into the English page.
  await expect(page.locator('h1')).not.toContainText(CS_HERO);
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

/**
 * The settlement demo is server-rendered SVG animated with CSS only — it has to
 * stay that way. It is the section that carries the whole pitch, and shipping
 * it as a client island would mean the one thing a crawler and a no-JS visitor
 * most need to read is the one thing they cannot.
 */
test('the settlement demo is in the server HTML, not a client island', async ({ request }) => {
  const en = await (await request.get('/en')).text();
  // Both halves of the collapse: the two-debt state and the one-payment state.
  expect(en).toContain('Jirka');
  expect(en).toContain('net them off');
  expect(en).toContain('2 payments');
  expect(en).toContain('1 payment');
  // The scale examples quote the algorithm's real output, not the old
  // "twenty payments, usually a couple" claim, which the code does not produce.
  expect(en).toContain('17');
  expect(en).toContain('5');
  expect(en).not.toContain('twenty payments');
});

test('the real app screenshots are referenced, not embedded as base64', async ({ page }) => {
  await page.goto('/en');
  const shots = page.locator('[data-testid="app-screenshots"] img');
  await expect(shots).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    const src = await shots.nth(i).getAttribute('src');
    expect(src, 'screenshot must be a served file, not a data: URI').toMatch(/^\/.*\.png$/);
  }
});

test('the demo figures hold as a non-zero landing in both themes', async ({ page }) => {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    const svg = page.locator('[data-testid="settle-demo"]');
    await expect(svg).toBeVisible();
    // The struck-through middle node is the whole idea: the person in the
    // middle of a chain of debts pays nothing.
    await expect(page.locator('[data-testid="demo-settled-mid"]')).toBeVisible();
  }
});

/**
 * Regression guard for a bug this suite could not otherwise see.
 *
 * Every `fill="var(--x)"` in the settlement diagrams resolves against a custom
 * property. An undefined one resolves to *nothing*, and SVG paints that black —
 * so a missing token turns a member node into a solid black disc. The text,
 * the a11y tree and the axe scan are all still correct in that state, so every
 * other test here passed while the section was visibly broken.
 *
 * This asserts the computed fill actually resolves to a real colour in both
 * themes, on both a light and a dark surface.
 */
test('every settlement node paints a real colour, not an unresolved var()', async ({ page }) => {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/en');
    const fills = await page
      .locator('[data-testid="settle-demo"] circle')
      .evaluateAll((nodes) => nodes.map((n) => getComputedStyle(n as SVGCircleElement).fill));
    expect(fills.length, `no circles found in ${scheme}`).toBeGreaterThan(0);
    for (const fill of fills) {
      // A resolved custom property gives rgb()/color(); an unresolved one gives
      // the initial value, which serialises to "rgb(0, 0, 0)".
      expect(fill, `unresolved fill in ${scheme} theme`).not.toBe('rgb(0, 0, 0)');
    }

    // Strokes matter too, and they fail differently: an unresolved `stroke`
    // computes to the initial `none`, so the shape silently stops being drawn
    // at all rather than turning black. That is how the single settled transfer
    // went missing while every text- and a11y-based assertion still passed.
    const strokes = await page
      .locator('[data-testid="settle-demo"] line, [data-testid="settle-demo"] circle')
      .evaluateAll((nodes) => nodes.map((n) => getComputedStyle(n as SVGElement).stroke));
    for (const stroke of strokes) {
      expect(stroke, `unresolved stroke in ${scheme} theme`).not.toBe('none');
    }
  }
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

    // Sign-up CTAs (hero, pricing, closing), app links (header, hero) and the
    // wordmark, by href rather than by clicking each: the bug was that these
    // were written as literals, and a literal is right for exactly one of the
    // two locales.
    //
    // These are floors, not exact counts. The original assertions pinned `3` and
    // `2`, which made every copy or layout change fail here for a reason that
    // had nothing to do with the thing being tested — the bug this caught was
    // wrong-locale hrefs, and an exact count cannot express that. What matters
    // is that *every* such link points at the locale's own route, so this walks
    // them all and checks each href rather than counting.
    const signupLinks = page.locator(`a[href="${signUp}"]`);
    expect(await signupLinks.count()).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < (await signupLinks.count()); i++) {
      await expect(signupLinks.nth(i)).toHaveAttribute('href', signUp);
    }
    const appLinks = page.locator(`a[href="${app}"]`);
    expect(await appLinks.count()).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < (await appLinks.count()); i++) {
      await expect(appLinks.nth(i)).toHaveAttribute('href', app);
    }
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
