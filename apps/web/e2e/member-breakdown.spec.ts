import { test, expect } from '@playwright/test';
import { signIn, uniqueEmail, openGroupSheet, closeSheet } from './helpers';

test.describe('Member balance breakdown', () => {
  test('opens from a Zůstatky row and shows a filterable ledger', async ({ page }, testInfo) => {
    await signIn(page, uniqueEmail('olivia', testInfo.workerIndex + Date.now()));

    await page.getByTestId('new-group-btn').click();
    await page.getByTestId('group-name-input').fill('Tatry');
    await page.getByTestId('create-group-submit').click();
    await page.getByText('Tatry').click();
    await expect(page.getByTestId('group-title')).toHaveText('Tatry');

    await openGroupSheet(page, 'members');
    await page.getByTestId('member-name-input').fill('Petr');
    await page.getByTestId('add-member-btn').click();
    await expect(page.getByRole('img', { name: 'Petr' }).first()).toBeVisible();
    await closeSheet(page);

    // One 900 expense paid by the creator (Olivia), split equally 2 ways.
    await page.getByTestId('add-expense-open').click();
    await page.getByTestId('expense-title-input').fill('Chata');
    await page.getByTestId('expense-amount-input').fill('900');
    await page.getByTestId('add-expense-submit').click();
    await expect(page.getByText('Chata')).toBeVisible();

    // Open the creator's balance row (they are the first member).
    await page.getByTestId('balance-row').first().click();
    await expect(page.getByTestId('member-breakdown')).toBeVisible();

    // Balance stat matches the +45000 the creator is owed (900 paid − 450 share).
    await expect(page.getByTestId('breakdown-balance')).toBeVisible();

    // Ledger has a paid (+) row and a share (−) row.
    await expect(page.getByTestId('breakdown-row')).toHaveCount(2);

    // Filter to "paid" leaves one row; "share" leaves one row.
    await page.getByTestId('breakdown-filter-paid').click();
    await expect(page.getByTestId('breakdown-row')).toHaveCount(1);
    await page.getByTestId('breakdown-filter-share').click();
    await expect(page.getByTestId('breakdown-row')).toHaveCount(1);
    await page.getByTestId('breakdown-filter-all').click();
    await expect(page.getByTestId('breakdown-row')).toHaveCount(2);
  });
});
