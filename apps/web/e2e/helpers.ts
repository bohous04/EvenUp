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

/** Open the group "⋯" menu and select one of its items (menu-<item> testid). */
export async function openGroupSheet(page: Page, item: string) {
  await page.getByTestId('group-menu-btn').click();
  await page.getByTestId(`menu-${item}`).click();
}

/** Close the currently open sheet via its X button. */
export async function closeSheet(page: Page) {
  await page.getByTestId('sheet-close').click();
}

/**
 * Ensure the shared instance OpenRouter key is configured (PRD §9.2): OCR
 * scanning runs on this admin-set key instead of the old per-user BYO key, so
 * any e2e flow that scans a receipt needs it in place first. Drives the real
 * admin dashboard (no server-side seeding shortcut) so the test still
 * exercises the actual gate the app enforces. Idempotent — a prior test in
 * the same run may have already set it — and leaves the browser signed out
 * on return, so call `signIn` again afterward to resume as the intended user.
 */
export async function ensureInstanceOcrKey(page: Page): Promise<void> {
  await page.context().clearCookies();
  await signIn(page, 'admin@example.com');
  await page.getByTestId('nav-admin').click();
  // `admin.getInstanceConfig`'s `hasKey ? status : form` ternary has no
  // distinct loading state — it renders the "not configured" form as its
  // default too, while the query is still in flight. Wait for that request to
  // settle before deciding whether a key already exists (from a prior test in
  // this run); otherwise filling the form can race the query, and once the
  // real "already configured" state lands, React swaps the form out from
  // under an in-flight click on its now-detached save button.
  await page.waitForLoadState('networkidle');
  const status = page.getByTestId('instance-key-status');
  if (!(await status.isVisible())) {
    await page.getByTestId('instance-key-input').fill('sk-or-test-instance-key');
    await page.getByTestId('instance-key-save').click();
    await expect(status).toBeVisible();
  }
  await page.context().clearCookies();
}
