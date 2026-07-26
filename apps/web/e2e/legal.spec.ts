import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * The four legal documents — terms, privacy, withdrawal/complaints, contact —
 * at `/…` in Czech and `/en/…` in English.
 *
 * Copy under test is duplicated from `packages/i18n/src/locales/legal.ts`:
 * Playwright's loader resolves neither the workspace package's `.js`-suffixed
 * source specifiers nor its `exports` map, so the catalog cannot be imported
 * here — the same constraint `landing.spec.ts` works around. Key parity and
 * non-emptiness are covered by `marketing.test.ts` in that package.
 */
const DOCS = [
  { slug: 'terms', cs: 'Obchodní podmínky', en: 'Terms of service' },
  { slug: 'privacy', cs: 'Zásady ochrany osobních údajů', en: 'Privacy policy' },
  { slug: 'refunds', cs: 'Odstoupení od smlouvy a reklamace', en: 'Withdrawal and complaints' },
  { slug: 'contact', cs: 'Kontakt', en: 'Contact' },
] as const;

for (const doc of DOCS) {
  /**
   * Asserts on the raw response body, before a browser touches it. These are
   * documents: a customer has to be able to read, print or archive the terms
   * they agreed to without a JavaScript runtime being involved, and a crawler
   * has to see the right language. Markup React injects during hydration would
   * satisfy a `toBeVisible()` and fail this.
   */
  test(`/${doc.slug} is a complete document in the server HTML, per locale`, async ({
    request,
  }) => {
    const cs = await request.get(`/${doc.slug}`);
    expect(cs.status()).toBe(200);
    const csBody = await cs.text();
    expect(csBody).toContain(doc.cs);
    expect(csBody).not.toContain(doc.en);

    const en = await request.get(`/en/${doc.slug}`);
    expect(en.status()).toBe(200);
    const enBody = await en.text();
    expect(enBody).toContain(doc.en);
  });

  test(`/${doc.slug} carries canonical and hreflang alternates`, async ({ page }) => {
    await page.goto(`/${doc.slug}`);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    await expect(
      page.locator(`link[rel="alternate"][hreflang="cs"][href$="/${doc.slug}"]`),
    ).toHaveCount(1);
    await expect(
      page.locator(`link[rel="alternate"][hreflang="en"][href$="/en/${doc.slug}"]`),
    ).toHaveCount(1);
  });

  /**
   * The banner is opt-out (`LEGAL_REVIEWED=true` retires it) precisely so it
   * survives to production unless somebody removes it on purpose. The e2e
   * build sets no such variable, so it must be here.
   */
  test(`/${doc.slug} carries the unreviewed-draft notice`, async ({ page }) => {
    await page.goto(`/${doc.slug}`);
    await expect(page.getByTestId('legal-draft-notice')).toBeVisible();
  });
}

/**
 * With `LEGAL_ENTITY_*` unset — as in this build — the company identification
 * must be a loud notice rather than a blank line or an invented IČO.
 */
test('the operator details fail loudly when they are not configured', async ({ page }) => {
  await page.goto('/contact');
  await expect(page.getByTestId('legal-entity-missing')).toBeVisible();
  await expect(page.getByTestId('legal-entity')).toHaveCount(0);
});

/**
 * Runs on both locales: the footer is the only route into these documents from
 * the public site, and a literal href in it would be correct for exactly one
 * of the two languages — the bug `landing.spec.ts` already guards for the
 * sign-up and app links.
 */
for (const { landing, prefix } of [
  { landing: '/', prefix: '' },
  { landing: '/en', prefix: '/en' },
]) {
  test(`the footer at ${landing} links to all four documents in the right locale`, async ({
    page,
  }) => {
    await page.goto(landing);
    for (const doc of DOCS) {
      await expect(page.locator(`footer a[href="${prefix}/${doc.slug}"]`)).toHaveCount(1);
    }
  });
}

/**
 * The regression this exists for: the marketing locale switch used to have `/`
 * and `/en` hardcoded, because `(marketing)` held exactly one page. On a legal
 * document that would drop a reader out of the document they were reading and
 * onto the landing page in the other language.
 */
test('the locale switch stays on the same document', async ({ page }) => {
  await page.goto('/privacy');
  await page.getByRole('link', { name: 'en', exact: true }).click();
  await expect(page).toHaveURL('/en/privacy');
  await expect(page.locator('h1')).toHaveText('Privacy policy');

  await page.getByRole('link', { name: 'cs', exact: true }).click();
  await expect(page).toHaveURL('/privacy');
  await expect(page.locator('h1')).toHaveText('Zásady ochrany osobních údajů');
});

/**
 * ...and it does so without JavaScript, which is why the switch renders real
 * `<a href>`s rather than pushing a route.
 */
test('the locale switch works with javascript disabled', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('/terms');
  const href = await page.getByRole('link', { name: 'en', exact: true }).getAttribute('href');
  expect(href).toBe('/en/terms');
  await ctx.close();
});

test('a legal document is accessible (§9.4)', async ({ page }) => {
  await page.goto('/privacy');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
});
