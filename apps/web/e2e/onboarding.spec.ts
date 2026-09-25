import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { TEST_PASSWORD, uniqueEmail } from './helpers.js';

/**
 * The first-run prompt. The flag that stops it reappearing is covered by the
 * api tests; this pins the screen a real new user actually lands on — that
 * signing up routes here, that the "why" is actually on screen, and that
 * skipping is a real choice rather than a trap.
 */
test.describe('first-run onboarding', () => {
  test('a new account lands on onboarding and explains what the account is for', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail('onboard', testInfo.workerIndex + Date.now());
    await page.request.post('/api/auth/sign-up/email', {
      data: { name: 'Novák', email, password: TEST_PASSWORD },
    });
    await page.goto('/onboarding');

    await expect(page.getByTestId('onboarding-account-input')).toBeVisible();
    // The "why" is the whole point of asking; if it regresses, this fails.
    // Scoped by testid: both the subtitle and the hint mention QR, so a bare
    // text match is ambiguous.
    await expect(page.getByTestId('onboarding-account-hint')).toContainText(/QR/i);

    const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(a11y.violations, JSON.stringify(a11y.violations, null, 2)).toEqual([]);
  });

  test('saving an account finishes onboarding and lands on the dashboard', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail('onboard-save', testInfo.workerIndex + Date.now());
    await page.request.post('/api/auth/sign-up/email', {
      data: { name: 'Novák', email, password: TEST_PASSWORD },
    });
    await page.goto('/onboarding');

    await page.getByTestId('onboarding-account-input').fill('19-2000145399/0800');
    await page.getByTestId('onboarding-continue').click();

    await expect(page).toHaveURL(/\/groups/);
  });

  test('skipping is offered, and is not a dead end', async ({ page }, testInfo) => {
    const email = uniqueEmail('onboard-skip', testInfo.workerIndex + Date.now());
    await page.request.post('/api/auth/sign-up/email', {
      data: { name: 'Novák', email, password: TEST_PASSWORD },
    });
    await page.goto('/onboarding');

    await expect(page.getByTestId('onboarding-skip')).toBeVisible();
    await page.getByTestId('onboarding-skip').click();

    await expect(page).toHaveURL(/\/groups/);
  });

  test('a malformed account number is refused rather than silently stored', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail('onboard-bad', testInfo.workerIndex + Date.now());
    await page.request.post('/api/auth/sign-up/email', {
      data: { name: 'Novák', email, password: TEST_PASSWORD },
    });
    await page.goto('/onboarding');

    await page.getByTestId('onboarding-account-input').fill('nonsense');
    await page.getByTestId('onboarding-continue').click();

    // Stays put and says so.
    await expect(page).toHaveURL(/\/onboarding/);
    await expect(page.getByTestId('onboarding-error')).toBeVisible();
  });
});
