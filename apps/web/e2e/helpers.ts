import { type Page, expect } from '@playwright/test';

/** Sign in via the dev magic-link echo endpoint (AUTH_DEV_ECHO=true). */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: /sign in with email/i }).click();
  await expect(page.getByTestId('magic-sent')).toBeVisible();

  const res = await page.request.get(`/api/dev/magic-link?email=${encodeURIComponent(email)}`);
  expect(res.ok()).toBeTruthy();
  const { url } = (await res.json()) as { url: string };
  await page.goto(url); // verifies the token and sets the session cookie
  await expect(page.getByTestId('new-group-btn')).toBeVisible();
}

/** Unique email per test run so repeated runs don't collide. */
export function uniqueEmail(prefix: string, seed: number): string {
  return `${prefix}+${seed}@example.com`;
}
