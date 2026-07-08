import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signIn, uniqueEmail } from './helpers';

test.describe('EvenUp critical journey (PRD §10.1)', () => {
  // Guarantee a test never leaves its context offline (avoids cross-test cascades).
  test.afterEach(async ({ page }) => {
    await page
      .context()
      .setOffline(false)
      .catch(() => undefined);
  });

  test('sign in, create group, add members, add expense, see minimized debts, settle', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail('olivia', testInfo.workerIndex + Date.now());
    await signIn(page, email);

    // Create a group.
    await page.getByTestId('new-group-btn').click();
    await page.getByTestId('group-name-input').fill('Tatry 2026');
    await page.getByTestId('create-group-submit').click();
    await page.getByText('Tatry 2026').click();
    await expect(page.getByTestId('group-title')).toHaveText('Tatry 2026');

    // Add two members (the creator is already a member).
    for (const name of ['Petr', 'Jana']) {
      await page.getByTestId('member-name-input').fill(name);
      await page.getByTestId('add-member-btn').click();
      // The member chip (role=img with the name as its accessible label).
      await expect(page.getByRole('img', { name }).first()).toBeVisible();
    }

    // Add an equal-split expense of 900 paid by the creator, categorized.
    await page.getByTestId('add-expense-open').click();
    await page.getByTestId('expense-title-input').fill('Chata');
    await page.getByTestId('expense-amount-input').fill('900');
    await page.getByTestId('expense-more-options').click();
    await page.getByTestId('category-chip-accommodation').click();
    await page.getByTestId('add-expense-submit').click();

    // Activity feed shows the create events (FR-9.1).
    await expect(page.getByTestId('activity-list')).toBeVisible();
    await expect(page.getByTestId('activity-list')).toContainText(/Chata/);
    // Before filtering: the feed shows member-added entries too.
    await expect(page.getByTestId('activity-list')).toContainText('Petr');
    // Filtering by type narrows the list to only expense.created — member entries disappear.
    await page.getByTestId('activity-action-filter').selectOption('expense.created');
    await expect(page.getByTestId('activity-list')).toContainText(/Chata/);
    await expect(page.getByTestId('activity-list')).not.toContainText('Petr');

    // Balances: the payer is +600.00, suggested payments exist (debt minimization).
    await expect(page.getByTestId('payments-list')).toBeVisible();
    await expect(page.getByText(/600[.,]00/)).toBeVisible();

    // Spend stats show the categorized expense (FR-12.2).
    await expect(page.getByTestId('spend-stats')).toBeVisible();
    await expect(
      page.getByTestId('spend-stats').getByText(/Accommodation|Ubytování/),
    ).toBeVisible();

    // A11y check on the populated group page (§9.4).
    const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(a11y.violations, JSON.stringify(a11y.violations, null, 2)).toEqual([]);

    // Settle the first suggested payment in cash -> it disappears.
    const paymentsBefore = await page.getByTestId('settle-btn').count();
    expect(paymentsBefore).toBeGreaterThan(0);
    await page.getByTestId('settle-btn').first().click();
    await page.getByTestId('mark-cash').first().click();
    await expect(async () => {
      const after = await page.getByTestId('settle-btn').count();
      expect(after).toBe(paymentsBefore - 1);
    }).toPass();
  });

  test('exact split + saved IBAN produces a SPAYD QR payment (FR-4.2, FR-7.2)', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail('exact', testInfo.workerIndex + Date.now());
    await signIn(page, email);

    await page.getByTestId('new-group-btn').click();
    await page.getByTestId('group-name-input').fill('Byt');
    await page.getByTestId('create-group-submit').click();
    await page.getByText('Byt').click();

    await page.getByTestId('member-name-input').fill('Petr');
    await page.getByTestId('add-member-btn').click();
    await expect(page.getByRole('img', { name: 'Petr' }).first()).toBeVisible();

    // Save the creator's IBAN (defaults to the first member in the select).
    await page.getByTestId('bank-iban-input').fill('CZ6508000000192000145399');
    await page.getByTestId('bank-save-btn').click();

    // Exact split: creator pays, Petr owes 100.
    await page.getByTestId('add-expense-open').click();
    await page.getByTestId('expense-title-input').fill('Nájem');
    await page.getByTestId('expense-more-options').click();
    await page.getByTestId('split-type-EXACT').click();
    const inputs = page.getByTestId('per-member-inputs').locator('input');
    await inputs.nth(0).fill('0'); // creator owes nothing
    await inputs.nth(1).fill('100'); // Petr owes 100
    await page.getByTestId('add-expense-submit').click();

    // A suggested payment exists; settling shows the SPAYD string.
    await expect(page.getByTestId('settle-btn')).toHaveCount(1);
    await page.getByTestId('settle-btn').first().click();
    await expect(page.getByText(/SPD\*1\.0\*ACC:CZ6508000000192000145399/)).toBeVisible();
  });

  test('OCR receipt → assign items via chips → itemized expense (FR-5.4, mocked OpenRouter)', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail('ocr', testInfo.workerIndex + Date.now());
    await signIn(page, email);

    // Save a (mock) OpenRouter key in settings.
    await page.getByRole('link', { name: /settings|nastavení/i }).click();
    await page.getByTestId('api-key-input').fill('sk-or-test-key');
    await page.getByTestId('save-key-btn').click();
    await expect(page.getByTestId('key-status')).toBeVisible();

    // A11y check on the settings page (§9.4).
    const settingsA11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(settingsA11y.violations, JSON.stringify(settingsA11y.violations, null, 2)).toEqual([]);

    // New group + a second member.
    await page.goto('/');
    await page.getByTestId('new-group-btn').click();
    await page.getByTestId('group-name-input').fill('Večeře');
    await page.getByTestId('create-group-submit').click();
    await page.getByText('Večeře').click();
    await page.getByTestId('member-name-input').fill('Petr');
    await page.getByTestId('add-member-btn').click();
    await expect(page.getByRole('img', { name: 'Petr' }).first()).toBeVisible();

    // Upload a (valid, tiny) image — it is downscaled client-side before upload;
    // the mocked OpenRouter ignores the pixels and returns two items.
    const tinyPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
      'base64',
    );
    await page.getByTestId('ocr-file-input').setInputFiles({
      name: 'receipt.png',
      mimeType: 'image/png',
      buffer: tinyPng,
    });
    await expect(page.getByTestId('ocr-items')).toBeVisible();
    // Items are editable inputs pre-filled from the mock extraction.
    await expect(page.getByTestId('ocr-item-name-0')).toHaveValue('Mléko');
    await expect(page.getByTestId('ocr-item-name-1')).toHaveValue('Chléb');
    // Running sum is shown before saving (24.90 + 35.10 = 60.00).
    await expect(page.getByTestId('ocr-total')).toContainText(/60[.,]00/);

    // Inline editor: change the first item's price -> the sum recomputes live.
    await page.getByTestId('ocr-item-price-0').fill('40');
    await expect(page.getByTestId('ocr-total')).toContainText(/75[.,]10/);

    // Assign every item to Petr by tapping his chip in each item.
    const petrChips = page.getByTestId('ocr-items').getByRole('button', { name: 'Petr' });
    for (const chip of await petrChips.all()) await chip.click();

    // Per-person sum reflects the assignment (Petr owes the whole 75.10).
    await expect(page.getByTestId('ocr-per-person')).toContainText(/75[.,]10/);

    await page.getByTestId('ocr-save-btn').click();

    // The itemized expense was created with the edited total (75.10 CZK).
    await expect(page.getByTestId('ocr-items')).toBeHidden();
    // Scoped to the transactions list: the activity feed also mentions "Receipt".
    await expect(page.getByTestId('transactions-list').getByText('Receipt')).toBeVisible();
    await expect(page.getByText(/75[.,]10/).first()).toBeVisible();

    // The receipt-backed expense surfaces a "View receipt" link (FR-5.8/5.9)
    // that resolves to the stored (mocked) receipt image.
    await expect(page.getByTestId('view-receipt')).toBeVisible();
    const href = await page.getByTestId('view-receipt').getAttribute('href');
    const res = await page.request.get(new URL(href!, page.url()).toString());
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('image/');
  });

  test('foreign-currency expense converts to base via an FX rate (FR-8.x)', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail('fx', testInfo.workerIndex + Date.now());
    await signIn(page, email);

    await page.getByTestId('new-group-btn').click();
    await page.getByTestId('group-name-input').fill('Tatry');
    // Base currency CZK (default).
    await page.getByTestId('create-group-submit').click();
    await page.getByText('Tatry').click();
    await page.getByTestId('member-name-input').fill('Petr');
    await page.getByTestId('add-member-btn').click();

    // 100 EUR at rate 25 -> 2500 CZK in base.
    await page.getByTestId('add-expense-open').click();
    await page.getByTestId('expense-title-input').fill('Lanovka');
    await page.getByTestId('expense-amount-input').fill('100');
    await page.getByTestId('expense-more-options').click();
    await page.getByTestId('expense-currency-select').selectOption('EUR');
    await page.getByTestId('expense-fx-input').fill('25');
    await page.getByTestId('add-expense-submit').click();

    // Activity shows the base amount (2 500 CZK) and the entered EUR amount.
    await expect(page.getByText(/2\s?500/).first()).toBeVisible();
    await expect(page.getByText(/100/).first()).toBeVisible();
  });

  test('CSV import creates expenses in bulk (Phase 4)', async ({ page }, testInfo) => {
    const email = uniqueEmail('csv', testInfo.workerIndex + Date.now());
    await signIn(page, email);

    await page.getByTestId('new-group-btn').click();
    await page.getByTestId('group-name-input').fill('Byt CSV');
    await page.getByTestId('create-group-submit').click();
    await page.getByText('Byt CSV').click();
    await page.getByTestId('member-name-input').fill('Petr');
    await page.getByTestId('add-member-btn').click();
    await expect(page.getByRole('img', { name: 'Petr' }).first()).toBeVisible();

    await page.getByTestId('csv-toggle').click();
    await page
      .getByTestId('csv-input')
      .fill(
        'Date,Description,Category,Cost,Currency\n2026-06-22,Groceries,groceries,300.00,CZK\n2026-06-23,Taxi,transport,150.00,CZK',
      );
    await page.getByTestId('csv-import-btn').click();

    await expect(page.getByTestId('csv-result')).toContainText('2');
    await expect(page.getByTestId('spend-stats')).toBeVisible();
  });

  test('add-expense opens a focused modal and Escape closes it (§9.4)', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail('modal', testInfo.workerIndex + Date.now());
    await signIn(page, email);

    await page.getByTestId('new-group-btn').click();
    await page.getByTestId('group-name-input').fill('Modal');
    await page.getByTestId('create-group-submit').click();
    await page.getByText('Modal').click();

    // The dense form no longer sits open on the page — a single trigger reveals it.
    await expect(page.getByTestId('expense-title-input')).toHaveCount(0);
    await page.getByTestId('add-expense-open').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('expense-title-input')).toBeVisible();

    // A11y on the OPEN dialog (§9.4).
    const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(a11y.violations, JSON.stringify(a11y.violations, null, 2)).toEqual([]);

    // Escape closes it and unmounts the form.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('expense-title-input')).toHaveCount(0);
  });

  test('advanced options keep required split inputs reachable and reset between expenses', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail('adv', testInfo.workerIndex + Date.now());
    await signIn(page, email);

    await page.getByTestId('new-group-btn').click();
    await page.getByTestId('group-name-input').fill('Adv');
    await page.getByTestId('create-group-submit').click();
    await page.getByText('Adv').click();
    await page.getByTestId('member-name-input').fill('Petr');
    await page.getByTestId('add-member-btn').click();
    await expect(page.getByRole('img', { name: 'Petr' }).first()).toBeVisible();

    // Choosing EXACT keeps the per-member inputs reachable: the "fewer options"
    // toggle is disabled so the required inputs can't be collapsed out of reach.
    await page.getByTestId('add-expense-open').click();
    await page.getByTestId('expense-title-input').fill('Nájem');
    await page.getByTestId('expense-more-options').click();
    await page.getByTestId('split-type-EXACT').click();
    await expect(page.getByTestId('per-member-inputs')).toBeVisible();
    await expect(page.getByTestId('expense-more-options')).toBeDisabled();

    const inputs = page.getByTestId('per-member-inputs').locator('input');
    await inputs.nth(0).fill('0');
    await inputs.nth(1).fill('100');
    await page.getByTestId('add-expense-submit').click();
    await expect(page.getByRole('dialog')).toBeHidden();

    // Reopening starts from clean defaults — advanced is collapsed and the
    // previous split/currency settings did not carry over.
    await page.getByTestId('add-expense-open').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByTestId('expense-currency-select')).toHaveCount(0);
    await expect(page.getByTestId('split-type-EXACT')).toHaveCount(0);
  });

  test('rename a member inline updates its name and chip initials', async ({ page }, testInfo) => {
    const email = uniqueEmail('rename', testInfo.workerIndex + Date.now());
    await signIn(page, email);

    await page.getByTestId('new-group-btn').click();
    await page.getByTestId('group-name-input').fill('Rename');
    await page.getByTestId('create-group-submit').click();
    await page.getByText('Rename').click();

    await page.getByTestId('member-name-input').fill('Petr');
    await page.getByTestId('add-member-btn').click();
    await expect(page.getByRole('img', { name: 'Petr' }).first()).toBeVisible();

    // Open the inline editor for Petr (the pencil's accessible name carries the
    // member name), clear it, and rename to "Pavel".
    const memberList = page.getByTestId('member-list');
    await memberList.getByRole('button', { name: /Petr/ }).click();
    const editor = page.getByTestId('member-rename-input');
    await editor.fill('Pavel');
    await page.getByTestId('member-rename-save').click();

    // The new name shows in the roster and the chip initials update (PA); Petr is gone.
    await expect(memberList.getByText('Pavel')).toBeVisible();
    await expect(memberList.getByRole('img', { name: 'Pavel' })).toBeVisible();
    await expect(memberList.getByRole('img', { name: 'Petr' })).toHaveCount(0);

    // Escape cancels an edit without changing the name.
    await memberList.getByRole('button', { name: /Pavel/ }).click();
    await page.getByTestId('member-rename-input').fill('Zmeneno');
    await page.getByTestId('member-rename-input').press('Escape');
    await expect(memberList.getByText('Pavel')).toBeVisible();
    await expect(memberList.getByText('Zmeneno')).toHaveCount(0);
  });

  test('language switch CZ <-> EN updates the UI', async ({ page }, testInfo) => {
    const email = uniqueEmail('lang', testInfo.workerIndex + Date.now());
    await signIn(page, email);

    // Default is Czech.
    await expect(page.getByRole('button', { name: 'Vytvořit skupinu' })).toBeVisible();
    // Switch to English.
    await page.getByRole('button', { name: 'EN' }).click();
    await expect(page.getByRole('button', { name: 'Create group' })).toBeVisible();
  });

  test('invite page is accessible (§9.4)', async ({ page }, testInfo) => {
    const email = uniqueEmail('inv', testInfo.workerIndex + Date.now());
    await signIn(page, email);
    await page.getByTestId('new-group-btn').click();
    await page.getByTestId('group-name-input').fill('Invite');
    await page.getByTestId('create-group-submit').click();
    await page.getByText('Invite').click();
    await page.getByTestId('invite-btn').click();
    const url = await page.getByTestId('invite-url').textContent();
    await page.goto(new URL(url!).pathname);
    const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(a11y.violations, JSON.stringify(a11y.violations, null, 2)).toEqual([]);
  });
});
