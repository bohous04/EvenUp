import { type Page, expect } from '@playwright/test';

const TEST_PASSWORD = 'test-password-123';

/** Create a verified-in-dev user and sign in through the password form. */
export async function signIn(page: Page, email: string): Promise<void> {
  // Create the account (idempotent-ish per unique email); auto-signs-in in dev.
  await page.request.post('/api/auth/sign-up/email', {
    data: { name: email.split('@')[0], email, password: TEST_PASSWORD },
  });
  // Exercise the login form itself (drops the sign-up session first).
  await page.context().clearCookies();
  await page.goto('/');
  await page.getByLabel(/email/i).fill(email);
  await page.getByTestId('password-input').fill(TEST_PASSWORD);
  await page.getByTestId('signin-submit').click();
  await expect(page.getByTestId('new-group-btn')).toBeVisible();
}

/** Unique email per test run so repeated runs don't collide. */
export function uniqueEmail(prefix: string, seed: number): string {
  return `${prefix}+${seed}@example.com`;
}
