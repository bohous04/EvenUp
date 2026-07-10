import { test, expect } from '@playwright/test';
import { signIn, uniqueEmail, openGroupSheet, closeSheet } from './helpers';

test.describe('Next Round card', () => {
  test('stays hidden below three expenses, then names the deepest qualifying debtor', async ({
    page,
  }, testInfo) => {
    await signIn(page, uniqueEmail('olivia', testInfo.workerIndex + Date.now()));

    await page.getByTestId('new-group-btn').click();
    await page.getByTestId('group-name-input').fill('Tatry 2026');
    await page.getByTestId('create-group-submit').click();
    await page.getByText('Tatry 2026').click();
    await expect(page.getByTestId('group-title')).toHaveText('Tatry 2026');

    await openGroupSheet(page, 'members');
    for (const name of ['Petr', 'Jana']) {
      await page.getByTestId('member-name-input').fill(name);
      await page.getByTestId('add-member-btn').click();
      // Not getByText(name): once a member exists, BalancesCard (rendered
      // underneath this sheet) already shows every member at a 0 balance, so
      // the plain name text is ambiguous. The member chip (role=img) is unique,
      // matching the same fix already used in critical-flow.spec.ts.
      await expect(page.getByRole('img', { name }).first()).toBeVisible();
    }
    await closeSheet(page);

    // "Paid by" is a radiogroup of chips with testid `payer-chip-<memberId>`; the
    // ids are cuids the test cannot know, so select by accessible name instead.
    // The payer chips are the only radios in the form that carry member names
    // (the other two radiogroups are split-type and category), so an unscoped
    // `radio` role is unambiguous — and, unlike scoping by the group's aria-label,
    // it does not depend on the active locale. The chip's accessible name combines
    // the inner MemberChip's aria-label with the visible name, so match a regex
    // rather than an exact string. The payer defaults to the group creator, so
    // only the third expense needs a click.
    const addExpense = async (title: string, amount: string, payer?: RegExp) => {
      await page.getByTestId('add-expense-open').click();
      await page.getByTestId('expense-title-input').fill(title);
      await page.getByTestId('expense-amount-input').fill(amount);
      if (payer) await page.getByRole('radio', { name: payer }).click();
      await page.getByTestId('add-expense-submit').click();
      await expect(page.getByText(title)).toBeVisible();
    };

    await addExpense('Chata', '900');
    await addExpense('Vlek', '900');

    // Two expenses: no typical round yet, so no card.
    await expect(page.getByTestId('next-round-card')).toHaveCount(0);

    await addExpense('Kava', '300', /Petr/);

    // Jana owes 700, Petr 400, gate is 300 -> Jana named, Petr runner-up.
    await expect(page.getByTestId('next-round-card')).toBeVisible();
    await expect(page.getByTestId('next-round-payer')).toContainText('Jana');
    await expect(page.getByTestId('next-round-runner-up')).toContainText('Petr');
  });
});
