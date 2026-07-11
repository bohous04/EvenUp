import { test, expect, type Page } from '@playwright/test';
import { signIn, uniqueEmail, openGroupSheet, closeSheet } from './helpers';

/** A group with the creator plus one extra member ("Petr"), open on its detail page. */
async function groupWithPetr(page: Page, name: string) {
  await page.getByTestId('new-group-btn').click();
  await page.getByTestId('group-name-input').fill(name);
  await page.getByTestId('create-group-submit').click();
  await page.getByText(name).click();
  await openGroupSheet(page, 'members');
  await page.getByTestId('member-name-input').fill('Petr');
  await page.getByTestId('add-member-btn').click();
  await expect(page.getByRole('img', { name: 'Petr' }).first()).toBeVisible();
  await closeSheet(page);
}

test.describe('Editing transactions in place', () => {
  test('tap an expense to edit its amount + title, then delete it', async ({ page }, testInfo) => {
    await signIn(page, uniqueEmail('edit', testInfo.workerIndex + Date.now()));
    await groupWithPetr(page, 'Edit');

    await page.getByTestId('add-expense-open').click();
    await page.getByTestId('expense-amount-input').fill('900');
    await page.getByTestId('expense-title-input').fill('Chata');
    await page.getByTestId('add-expense-submit').click();
    await expect(page.getByTestId('transactions-list').getByText('Chata')).toBeVisible();

    // The row is tappable and opens a sheet PREFILLED with the current values.
    await page.getByTestId('transaction-row').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    // Prefilled with the canonical amount (2-decimal string) and title.
    await expect(page.getByTestId('expense-amount-input')).toHaveValue('900.00');
    await expect(page.getByTestId('expense-title-input')).toHaveValue('Chata');

    // Amount input rejects a third decimal (2-decimal clamp).
    await page.getByTestId('expense-amount-input').fill('');
    await page.getByTestId('expense-amount-input').pressSequentially('600.999');
    await expect(page.getByTestId('expense-amount-input')).toHaveValue('600.99');

    // Save an actual edit and confirm it updated in place (not duplicated).
    await page.getByTestId('expense-amount-input').fill('600');
    await page.getByTestId('expense-title-input').fill('Chata upravena');
    await page.getByTestId('add-expense-submit').click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('transactions-list').getByText('Chata upravena')).toBeVisible();
    await expect(page.getByTestId('transaction-row')).toHaveCount(1);
    await expect(page.getByText(/600[.,]00/).first()).toBeVisible();

    // Delete from the edit sheet.
    page.once('dialog', (d) => void d.accept());
    await page.getByTestId('transaction-row').first().click();
    await page.getByTestId('edit-expense-delete').click();
    await expect(page.getByTestId('transactions-list')).toHaveCount(0);
  });

  test('EXACT split: clearing a member amount keeps it empty (no auto-refill)', async ({
    page,
  }, testInfo) => {
    await signIn(page, uniqueEmail('exactclear', testInfo.workerIndex + Date.now()));
    await groupWithPetr(page, 'Exact');

    await page.getByTestId('add-expense-open').click();
    await page.getByTestId('expense-title-input').fill('Split');
    await page.getByTestId('expense-amount-input').fill('100');
    await page.getByTestId('expense-split-row').click();
    await page.getByTestId('split-type-EXACT').click();

    const inputs = page.getByTestId('per-member-inputs').locator('input');
    // Untouched fields preview their auto-balanced share (2 members → 50.00 each).
    await expect(inputs.nth(0)).toHaveValue('50.00');
    // Clearing a field must leave it EMPTY — it must not snap back to 50.
    await inputs.nth(0).fill('');
    await expect(inputs.nth(0)).toHaveValue('');
    // A manually typed value is preserved exactly.
    await inputs.nth(0).fill('30');
    await expect(inputs.nth(0)).toHaveValue('30');
  });

  test('editing a SHARES expense keeps its split type and weights', async ({ page }, testInfo) => {
    await signIn(page, uniqueEmail('shares', testInfo.workerIndex + Date.now()));
    await groupWithPetr(page, 'Shares');

    // Create a weighted (SHARES 2:1) expense.
    await page.getByTestId('add-expense-open').click();
    await page.getByTestId('expense-title-input').fill('Weighted');
    await page.getByTestId('expense-amount-input').fill('90');
    await page.getByTestId('expense-split-row').click();
    await page.getByTestId('split-type-SHARES').click();
    const addInputs = page.getByTestId('per-member-inputs').locator('input');
    await addInputs.nth(0).fill('2');
    await addInputs.nth(1).fill('1');
    await page.getByTestId('add-expense-submit').click();
    await expect(page.getByTestId('transactions-list').getByText('Weighted')).toBeVisible();

    // Re-open for editing: the split type is STILL Shares and the weights are prefilled
    // (not coerced to exact amounts).
    await page.getByTestId('transaction-row').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByTestId('expense-split-row').click();
    await expect(page.getByTestId('split-type-SHARES')).toHaveAttribute('aria-checked', 'true');
    const editInputs = page.getByTestId('per-member-inputs').locator('input');
    await expect(editInputs.nth(0)).toHaveValue('2');
    await expect(editInputs.nth(1)).toHaveValue('1');
  });

  test('tap a settlement to edit its amount', async ({ page }, testInfo) => {
    await signIn(page, uniqueEmail('settleedit', testInfo.workerIndex + Date.now()));
    await groupWithPetr(page, 'Settle');

    // Expense of 900 split equally → Petr owes 450; settle it in cash to record a transfer.
    await page.getByTestId('add-expense-open').click();
    await page.getByTestId('expense-amount-input').fill('900');
    await page.getByTestId('expense-title-input').fill('Chata');
    await page.getByTestId('add-expense-submit').click();
    await page.getByTestId('settle-btn').first().click();
    await page.getByTestId('mark-cash').first().click();

    // The recorded settlement shows up as a transaction row; tap it to edit.
    const settlementRow = page
      .getByTestId('transaction-row')
      .filter({ hasText: /Settlement|Převod|Transfer/ });
    await expect(settlementRow).toBeVisible();
    await settlementRow.click();
    await expect(page.getByTestId('edit-transfer-modal')).toBeVisible();

    await page.getByTestId('transfer-amount').fill('123');
    await page.getByTestId('edit-transfer-submit').click();
    await expect(page.getByTestId('edit-transfer-modal')).toBeHidden();
    await expect(page.getByText(/123[.,]00/).first()).toBeVisible();
  });
});
