import { test, expect, type Page } from '@playwright/test';
import * as OTPAuth from 'otpauth';

/**
 * End-to-end 2FA (TOTP) flow against a real build + Postgres: enable with a
 * generated code, sign out, sign in THROUGH the 2FA gate (wrong code rejected,
 * right code accepted), then disable. This is the auth-critical path that unit
 * tests can't cover.
 */
const TEST_PASSWORD = 'test-password-123';

/** Generate the current 6-digit TOTP for a base32 secret (Better Auth defaults). */
function totp(secret: string): string {
  return new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(secret),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  }).generate();
}

async function passwordSignIn(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel(/email/i).fill(email);
  await page.getByTestId('password-input').fill(TEST_PASSWORD);
  await page.getByTestId('signin-submit').click();
}

test('2FA: enable → sign in with code → disable', async ({ page }) => {
  const email = `2fa+${Date.now()}@example.com`;

  // Create a dev-verified account, then sign in through the form.
  await page.request.post('/api/auth/sign-up/email', {
    data: { name: '2fa', email, password: TEST_PASSWORD },
  });
  await page.context().clearCookies();
  await passwordSignIn(page, email);
  await expect(page.getByTestId('new-group-btn')).toBeVisible();

  // Enable 2FA in Settings.
  await page.goto('/settings');
  await expect(page.getByTestId('2fa-status')).toBeVisible();
  await page.getByTestId('enable-2fa-btn').click();
  await page.getByTestId('2fa-password').fill(TEST_PASSWORD);
  await page.getByTestId('2fa-password-continue').click();

  // Read the shown secret, confirm with a real code → backup codes shown once.
  const secret = (await page.getByTestId('2fa-secret').innerText()).trim();
  expect(secret.length).toBeGreaterThan(0);
  await page.getByTestId('2fa-code').fill(totp(secret));
  await page.getByTestId('2fa-confirm-btn').click();
  await expect(page.getByTestId('2fa-backup')).toBeVisible();
  await page.getByTestId('2fa-done-btn').click();
  await expect(page.getByTestId('2fa-status')).toHaveText(/on|zapnuto/i);

  // Sign out, sign in → the 2FA code step gates the session.
  await page.context().clearCookies();
  await passwordSignIn(page, email);
  const codeInput = page.getByTestId('signin-2fa-code');
  await expect(codeInput).toBeVisible();
  await expect(page.getByTestId('new-group-btn')).toHaveCount(0); // not signed in yet

  // Wrong code is rejected (still on the 2FA step, no session).
  await codeInput.fill('000000');
  await page.getByTestId('signin-2fa-submit').click();
  await expect(codeInput).toBeVisible();
  await expect(page.getByTestId('new-group-btn')).toHaveCount(0);

  // Correct code signs in.
  await codeInput.fill(totp(secret));
  await page.getByTestId('signin-2fa-submit').click();
  await expect(page.getByTestId('new-group-btn')).toBeVisible();

  // Disable 2FA.
  await page.goto('/settings');
  await page.getByTestId('disable-2fa-btn').click();
  await page.getByTestId('2fa-password').fill(TEST_PASSWORD);
  await page.getByTestId('2fa-password-continue').click();
  await expect(page.getByTestId('2fa-status')).toHaveText(/off|vypnuto/i);
});
