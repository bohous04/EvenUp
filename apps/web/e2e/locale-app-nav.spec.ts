import { test, expect } from '@playwright/test';
import { signIn, uniqueEmail } from './helpers';

/**
 * Locale survival inside the signed-in app.
 *
 * Every internal link in `(app)` used to be a hardcoded Czech route
 * (`href="/groups"`). `/en/settings` served `<html lang="en">` but its only app
 * link was `/groups`, so one click handed the visitor to the middleware, which
 * rewrote it to `/cs/groups`: Czech copy, `<html lang="cs">`, and an
 * `x-locale: cs` header that flips `currencyForLocale` with it — a user one
 * click out of `/en/vip` (EUR) landed in a CZK app.
 *
 * `<AppLink>` (components/app-link.tsx) resolves the locale internally now.
 * These tests assert on the *rendered hrefs* as well as on the navigation,
 * because an href that merely happens to work via a redirect is the bug: the
 * redirect is what changes the locale.
 */

test('English app pages render /en hrefs, and navigation keeps the locale', async ({ page }) => {
  await signIn(page, uniqueEmail('locale-nav', Date.now()));

  await page.goto('/en/groups');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  // The header's own links, as they appear in the document. A bare `/settings`
  // here is the Czech route no matter what the click appears to do.
  await expect(page.getByTestId('nav-vip')).toBeVisible();
  const hrefs = await page
    .locator('header a[href^="/"]')
    .evaluateAll((links) => links.map((l) => l.getAttribute('href')!));
  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) {
    expect(href, `header href ${href} must stay inside /en`).toMatch(/^\/en(\/|$)/);
  }

  // …and the navigation itself: click through to the VIP page (the route to
  // checkout, which prices in EUR for English) and stay English.
  await page.getByTestId('nav-vip').click();
  await expect(page).toHaveURL(/\/en\/vip$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  // Back out via the page's own "← Groups" link — a second hop, because the
  // bug was per-link and one working link proves nothing about the rest.
  await page
    .getByRole('link', { name: /groups/i })
    .last()
    .click();
  await expect(page).toHaveURL(/\/en\/groups$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('the Czech app keeps its unprefixed routes', async ({ page }) => {
  // `localizedPath` is not "always prefix": Czech is the unprefixed default,
  // and a `/cs/...` href would 308 on every click.
  await signIn(page, uniqueEmail('locale-nav-cs', Date.now()));
  await page.goto('/groups');
  const hrefs = await page
    .locator('header a[href^="/"]')
    .evaluateAll((links) => links.map((l) => l.getAttribute('href')!));
  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) {
    expect(href, `header href ${href} must not carry a locale prefix`).not.toMatch(
      /^\/(cs|en)(\/|$)/,
    );
  }
});

test('the landing price list links to /vip in both locales', async ({ page }) => {
  // B1: nothing anywhere linked to `/vip`, so the only way to buy was to type
  // the URL. The link is locale-resolved for the same reason as everything
  // above.
  await page.goto('/');
  await expect(page.getByTestId('pricing-vip-cta')).toHaveAttribute('href', '/vip');

  await page.goto('/en');
  await expect(page.getByTestId('pricing-vip-cta')).toHaveAttribute('href', '/en/vip');
});

test('a signed-out visitor following the pricing link gets a sign-in prompt, not a dead end', async ({
  page,
}) => {
  // D10: `/vip` used to render a bare "Back" link when signed out. It is a
  // public destination now.
  await page.context().clearCookies();
  await page.goto('/en');
  await page.getByTestId('pricing-vip-cta').click();
  await expect(page).toHaveURL(/\/en\/vip$/);
  await expect(page.getByTestId('vip-signed-out')).toBeVisible();
  await expect(page.getByTestId('vip-signin-link')).toHaveAttribute('href', '/en/groups');
});
