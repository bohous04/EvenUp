import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signIn, uniqueEmail, openGroupSheet, closeSheet } from './helpers';

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
    await openGroupSheet(page, 'members');
    for (const name of ['Petr', 'Jana']) {
      await page.getByTestId('member-name-input').fill(name);
      await page.getByTestId('add-member-btn').click();
      // The member chip (role=img with the name as its accessible label).
      await expect(page.getByRole('img', { name }).first()).toBeVisible();
    }
    await closeSheet(page);

    // Add an equal-split expense of 900 paid by the creator, categorized.
    await page.getByTestId('add-expense-open').click();
    await page.getByTestId('expense-amount-input').fill('900');
    await page.getByTestId('expense-title-input').fill('Chata');
    await page.getByTestId('expense-category-row').click();
    await page.getByTestId('category-chip-accommodation').click();
    await page.getByTestId('add-expense-submit').click();

    // Activity feed shows the create events (FR-9.1).
    await openGroupSheet(page, 'activity');
    await expect(page.getByTestId('activity-list')).toBeVisible();
    await expect(page.getByTestId('activity-list')).toContainText(/Chata/);
    // Before filtering: the feed shows member-added entries too.
    await expect(page.getByTestId('activity-list')).toContainText('Petr');
    // Filtering by type narrows the list to only expense.created — member entries disappear.
    await page.getByTestId('activity-action-filter').selectOption('expense.created');
    await expect(page.getByTestId('activity-list')).toContainText(/Chata/);
    await expect(page.getByTestId('activity-list')).not.toContainText('Petr');
    await closeSheet(page);

    // Balances: the payer is +600.00, suggested payments exist (debt minimization).
    await expect(page.getByTestId('payments-list')).toBeVisible();
    await expect(page.getByText(/600[.,]00/)).toBeVisible();

    // Spend stats show the categorized expense (FR-12.2).
    await openGroupSheet(page, 'stats');
    await expect(page.getByTestId('spend-stats')).toBeVisible();
    await expect(
      page.getByTestId('spend-stats').getByText(/Accommodation|Ubytování/),
    ).toBeVisible();
    await closeSheet(page);

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

    await openGroupSheet(page, 'members');
    await page.getByTestId('member-name-input').fill('Petr');
    await page.getByTestId('add-member-btn').click();
    await expect(page.getByRole('img', { name: 'Petr' }).first()).toBeVisible();
    await closeSheet(page);

    // Save the creator's bank account in Settings (CZ format; spec 2026-07-09).
    await page.getByRole('link', { name: /settings|nastavení/i }).click();
    await page.getByTestId('bank-account-input').fill('19-2000145399/0800');
    await page.getByTestId('bank-account-save').click();
    await expect(page.getByTestId('bank-account-value')).toHaveText('19-2000145399/0800');
    await page.goBack();

    // The per-group bank sheet is gone from the ⋯ menu.
    await page.getByTestId('group-menu-btn').click();
    await expect(page.getByTestId('menu-bank')).toHaveCount(0);
    await page.getByTestId('sheet-close').click();

    // Exact split: creator pays, Petr owes 100. The top amount is the target
    // total (required for EXACT — untouched members balance against it).
    await page.getByTestId('add-expense-open').click();
    await page.getByTestId('expense-title-input').fill('Nájem');
    await page.getByTestId('expense-amount-input').fill('100');
    await page.getByTestId('expense-split-row').click();
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

  test('nickname change in settings renames linked members in groups', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail('nick', testInfo.workerIndex + Date.now());
    await signIn(page, email);

    await page.getByTestId('new-group-btn').click();
    await page.getByTestId('group-name-input').fill('Nick');
    await page.getByTestId('create-group-submit').click();
    await page.getByText('Nick').click();
    await expect(page.getByTestId('group-title')).toHaveText('Nick');

    await page.getByRole('link', { name: /settings|nastavení/i }).click();
    await page.getByTestId('profile-name-input').fill('Michal Novák');
    await page.getByTestId('profile-name-save').click();
    await expect(page.getByTestId('profile-name-saved')).toBeVisible();

    await page.goto('/');
    await page.getByText('Nick').click();
    await openGroupSheet(page, 'members');
    await expect(page.getByTestId('member-list').getByText('Michal Novák')).toBeVisible();
  });

  test('OCR receipt → assign items via chips → itemized expense (FR-5.4, mocked OpenRouter)', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail('ocr', testInfo.workerIndex + Date.now());
    await signIn(page, email);

    // Receipt-photo storage is VIP-only (FR-5.8); grant VIP via the dev hook so
    // the "View receipt" assertion below has an image to resolve.
    const vipRes = await page.request.post(`/api/dev/make-vip?email=${encodeURIComponent(email)}`);
    expect(vipRes.ok()).toBeTruthy();

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
    await openGroupSheet(page, 'members');
    await page.getByTestId('member-name-input').fill('Petr');
    await page.getByTestId('add-member-btn').click();
    await expect(page.getByRole('img', { name: 'Petr' }).first()).toBeVisible();
    await closeSheet(page);

    // Upload a (valid, tiny) image — it is downscaled client-side before upload;
    // the mocked OpenRouter ignores the pixels and returns two items.
    const tinyPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
      'base64',
    );
    await page.getByTestId('add-expense-open').click();
    await page.getByTestId('expense-receipt-row').click();

    // A11y check on the stacked expense+OCR sheets (§9.4).
    const stackedA11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(stackedA11y.violations, JSON.stringify(stackedA11y.violations, null, 2)).toEqual([]);

    await page.getByTestId('ocr-file-input').setInputFiles({
      name: 'receipt.png',
      mimeType: 'image/png',
      buffer: tinyPng,
    });
    // The gallery picker queues into the review list; scan the queued page(s).
    await page.getByTestId('ocr-scan-pages-btn').click();
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
    // Both stacked sheets close on save. A bare `.toBeHidden()` here is a strict-mode
    // violation while the two <dialog> elements are simultaneously open mid-save, so
    // assert on the count going to zero instead — a stronger check (both must close).
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // The stacked-sheet close must release the body scroll lock (regression guard).
    const bodyOverflow = await page.evaluate(() => document.body.style.overflow);
    expect(bodyOverflow).toBe('');

    // The itemized expense was created with the edited total (75.10 CZK).
    await expect(page.getByTestId('ocr-items')).toBeHidden();
    // OCR names the expense after the detected merchant (the mock returns "Albert").
    await expect(page.getByTestId('transactions-list').getByText('Albert')).toBeVisible();
    await expect(page.getByText(/75[.,]10/).first()).toBeVisible();

    // The receipt-backed expense surfaces a "View receipt" link (FR-5.8/5.9)
    // that resolves to the stored (mocked) receipt image.
    await expect(page.getByTestId('view-receipt')).toBeVisible();
    const href = await page.getByTestId('view-receipt').getAttribute('href');
    const res = await page.request.get(new URL(href!, page.url()).toString());
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('image/');

    // Re-opening the saved itemized expense edits it with the same shared
    // ItemizedEditor (Task 3): the split row shows both persisted items.
    await page.getByTestId('transaction-row').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByTestId('expense-split-row').click();
    await expect(page.getByTestId('split-type-ITEMIZED')).toHaveAttribute('aria-checked', 'true');
    // Item order isn't persisted, so match either of the two known names rather
    // than assuming a position — the point is the items round-trip and display.
    await expect(page.getByTestId('ocr-item-name-0')).toHaveValue(/Mléko|Chléb/);
    await expect(page.getByTestId('ocr-item-name-1')).toHaveValue(/Mléko|Chléb/);

    // Bump one item's price by 10 -> whichever item it is, the total moves by
    // the same +10 (75.10 -> 85.10).
    const priceInput = page.getByTestId('ocr-item-price-0');
    const before = Number((await priceInput.inputValue()).replace(',', '.'));
    await priceInput.fill(String(before + 10));
    await page.getByTestId('add-expense-submit').click();
    await expect(page.getByRole('dialog')).toBeHidden();

    // The change persisted — the transaction list shows the new total.
    await expect(page.getByText(/85[.,]10/).first()).toBeVisible();
  });

  test('multi-screenshot receipt import → itemized expense (mocked OpenRouter)', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail('ocrmulti', testInfo.workerIndex + Date.now());
    await signIn(page, email);

    // Receipt-photo storage is VIP-only (FR-5.8); grant VIP via the dev hook.
    const vipRes = await page.request.post(`/api/dev/make-vip?email=${encodeURIComponent(email)}`);
    expect(vipRes.ok()).toBeTruthy();

    // Save a (mock) OpenRouter key in settings.
    await page.getByRole('link', { name: /settings|nastavení/i }).click();
    await page.getByTestId('api-key-input').fill('sk-or-test-key');
    await page.getByTestId('save-key-btn').click();
    await expect(page.getByTestId('key-status')).toBeVisible();

    // New group + a second member.
    await page.goto('/');
    await page.getByTestId('new-group-btn').click();
    await page.getByTestId('group-name-input').fill('Nákup');
    await page.getByTestId('create-group-submit').click();
    await page.getByText('Nákup').click();
    await openGroupSheet(page, 'members');
    await page.getByTestId('member-name-input').fill('Petr');
    await page.getByTestId('add-member-btn').click();
    await expect(page.getByRole('img', { name: 'Petr' }).first()).toBeVisible();
    await closeSheet(page);

    // Reuse the same tiny 1x1 PNG the single-image OCR test uses.
    const tinyPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
      'base64',
    );
    await page.getByTestId('add-expense-open').click();
    await page.getByTestId('expense-receipt-row').click();

    // Select two pages, confirm both preview rows appear, then remove one
    // before scanning — the mocked backend returns a fixed receipt regardless
    // of how many pages are actually sent.
    await page.getByTestId('ocr-file-input').setInputFiles([
      { name: 'p1.png', mimeType: 'image/png', buffer: tinyPng },
      { name: 'p2.png', mimeType: 'image/png', buffer: tinyPng },
    ]);
    await expect(page.getByTestId('ocr-page-0')).toBeVisible();
    await expect(page.getByTestId('ocr-page-1')).toBeVisible();
    await page.getByTestId('ocr-page-remove-1').click();
    await expect(page.getByTestId('ocr-page-1')).toHaveCount(0);

    await page.getByTestId('ocr-scan-pages-btn').click();
    await expect(page.getByTestId('ocr-items')).toBeVisible();
    await expect(page.getByTestId('ocr-item-name-0')).toHaveValue('Mléko');
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
    await openGroupSheet(page, 'members');
    await page.getByTestId('member-name-input').fill('Petr');
    await page.getByTestId('add-member-btn').click();
    await closeSheet(page);

    // 100 EUR at rate 25 -> 2500 CZK in base.
    await page.getByTestId('add-expense-open').click();
    await page.getByTestId('expense-amount-input').fill('100');
    await page.getByTestId('expense-title-input').fill('Lanovka');
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
    await openGroupSheet(page, 'members');
    await page.getByTestId('member-name-input').fill('Petr');
    await page.getByTestId('add-member-btn').click();
    await expect(page.getByRole('img', { name: 'Petr' }).first()).toBeVisible();
    await closeSheet(page);

    await openGroupSheet(page, 'csv');

    // A11y on the OPEN CSV import sheet.
    const sheetA11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(sheetA11y.violations, JSON.stringify(sheetA11y.violations, null, 2)).toEqual([]);

    await page
      .getByTestId('csv-input')
      .fill(
        'Date,Description,Category,Cost,Currency\n2026-06-22,Groceries,groceries,300.00,CZK\n2026-06-23,Taxi,transport,150.00,CZK',
      );
    await page.getByTestId('csv-import-btn').click();

    await expect(page.getByTestId('csv-result')).toContainText('2');
    await closeSheet(page);

    await openGroupSheet(page, 'stats');
    await expect(page.getByTestId('spend-stats')).toBeVisible();
    await closeSheet(page);
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
    await openGroupSheet(page, 'members');
    await page.getByTestId('member-name-input').fill('Petr');
    await page.getByTestId('add-member-btn').click();
    await expect(page.getByRole('img', { name: 'Petr' }).first()).toBeVisible();
    await closeSheet(page);

    // Choosing EXACT keeps the per-member inputs reachable: the split row's
    // toggle is disabled so the required inputs can't be collapsed out of reach.
    await page.getByTestId('add-expense-open').click();
    await page.getByTestId('expense-title-input').fill('Nájem');
    await page.getByTestId('expense-amount-input').fill('100');
    await page.getByTestId('expense-split-row').click();
    await page.getByTestId('split-type-EXACT').click();
    await expect(page.getByTestId('per-member-inputs')).toBeVisible();
    // The split row is collapsible now (users asked to be able to close it), so
    // its toggle stays enabled even for a non-EQUAL split.
    await expect(page.getByTestId('expense-split-row')).toBeEnabled();

    const inputs = page.getByTestId('per-member-inputs').locator('input');
    await inputs.nth(0).fill('0');
    await inputs.nth(1).fill('100');
    await page.getByTestId('add-expense-submit').click();
    await expect(page.getByRole('dialog')).toBeHidden();

    // Reopening starts from clean defaults — the split row is collapsed again and
    // the currency is back to base.
    await page.getByTestId('add-expense-open').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByTestId('split-type-EXACT')).toHaveCount(0);
    await expect(page.getByTestId('expense-currency-select')).toHaveValue('CZK');
  });

  test('admin (ADMIN_EMAILS) reaches the management dashboard (§9.4)', async ({ page }) => {
    // playwright.config seeds ADMIN_EMAILS=admin@example.com; the auth hook flags it.
    await signIn(page, 'admin@example.com');
    await expect(page.getByTestId('nav-admin')).toBeVisible();
    await page.getByTestId('nav-admin').click();
    await expect(page.getByTestId('admin-title')).toBeVisible();

    const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(a11y.violations, JSON.stringify(a11y.violations, null, 2)).toEqual([]);
  });

  test('non-admins have no admin link and /admin is not found for them', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail('nonadmin', testInfo.workerIndex + Date.now());
    await signIn(page, email);
    await expect(page.getByTestId('nav-admin')).toHaveCount(0);
    await page.goto('/admin');
    await expect(page.getByTestId('admin-title')).toHaveCount(0);
  });

  test('admin can grant VIP to a user from the dashboard', async ({ page }, testInfo) => {
    // Create the target user first (their account persists), then switch to admin.
    const target = uniqueEmail('viptarget', testInfo.workerIndex + Date.now());
    await signIn(page, target);
    await page.context().clearCookies();
    await signIn(page, 'admin@example.com');

    await page.getByTestId('nav-admin').click();
    await expect(page.getByTestId('admin-users-table')).toBeVisible();

    const toggle = page.getByTestId(`vip-toggle-${target}`);
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  test('admin can delete a user through the confirm modal', async ({ page }, testInfo) => {
    const target = uniqueEmail('deltarget', testInfo.workerIndex + Date.now());
    await signIn(page, target);
    await page.context().clearCookies();
    await signIn(page, 'admin@example.com');

    await page.getByTestId('nav-admin').click();
    await expect(page.getByTestId(`admin-user-${target}`)).toBeVisible();

    await page.getByTestId(`delete-user-${target}`).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByTestId('delete-user-confirm').click();

    await expect(page.getByTestId(`admin-user-${target}`)).toHaveCount(0);
  });

  test('rename a member inline updates its name and chip initials', async ({ page }, testInfo) => {
    const email = uniqueEmail('rename', testInfo.workerIndex + Date.now());
    await signIn(page, email);

    await page.getByTestId('new-group-btn').click();
    await page.getByTestId('group-name-input').fill('Rename');
    await page.getByTestId('create-group-submit').click();
    await page.getByText('Rename').click();

    await openGroupSheet(page, 'members');
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
    await closeSheet(page);
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
    await openGroupSheet(page, 'invite');
    await page.getByTestId('invite-btn').click();
    const url = await page.getByTestId('invite-url').textContent();
    await page.goto(new URL(url!).pathname);
    const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(a11y.violations, JSON.stringify(a11y.violations, null, 2)).toEqual([]);
  });

  test('invite link survives sign-in — invitee returns to the invite and can join', async ({
    page,
  }, testInfo) => {
    const owner = uniqueEmail('inviter', testInfo.workerIndex + Date.now());
    await signIn(page, owner);

    await page.getByTestId('new-group-btn').click();
    await page.getByTestId('group-name-input').fill('Výlet');
    await page.getByTestId('create-group-submit').click();
    await page.getByText('Výlet').click();

    await openGroupSheet(page, 'invite');
    await page.getByTestId('invite-btn').click();
    const inviteUrl = await page.getByTestId('invite-url').textContent();
    await closeSheet(page);

    // Create the invitee's account, then follow the link signed-out — the
    // typical recipient state.
    const invitee = uniqueEmail('invitee', testInfo.workerIndex + Date.now());
    await page.context().clearCookies();
    await page.request.post('/api/auth/sign-up/email', {
      data: { name: 'Katka', email: invitee, password: 'test-password-123' },
    });
    await page.context().clearCookies();
    await page.goto(new URL(inviteUrl!).pathname);

    // Signing in from the embedded form must land back on the invite, not '/'.
    await page.getByLabel(/email/i).fill(invitee);
    await page.getByTestId('password-input').fill('test-password-123');
    await page.getByTestId('signin-submit').click();
    await expect(page.getByRole('heading', { name: 'Výlet' })).toBeVisible();
    await expect(page).toHaveURL(/\/invite\//);

    // Join as a new member; claiming pushes to the dashboard with the group.
    await page.getByTestId('invite-join-new').click();
    await expect(page.getByTestId('group-title')).toHaveCount(0);
    await expect(page.getByText('Výlet')).toBeVisible();
  });

  test('large amounts never wrap (design-spec hard rule)', async ({ page }, testInfo) => {
    const email = uniqueEmail('wrap', testInfo.workerIndex + Date.now());
    await signIn(page, email);

    await page.getByTestId('new-group-btn').click();
    await page.getByTestId('group-name-input').fill('Wrap');
    await page.getByTestId('create-group-submit').click();
    await page.getByText('Wrap').click();

    await openGroupSheet(page, 'members');
    await page.getByTestId('member-name-input').fill('Petr');
    await page.getByTestId('add-member-btn').click();
    await expect(page.getByRole('img', { name: 'Petr' }).first()).toBeVisible();
    await closeSheet(page);

    await page.getByTestId('add-expense-open').click();
    await page.getByTestId('expense-amount-input').fill('1234567.89');
    await page.getByTestId('expense-title-input').fill('Mega');
    await page.getByTestId('add-expense-submit').click();

    // Every settle amount renders on a single line even at phone width.
    await page.setViewportSize({ width: 390, height: 844 });
    const amount = page.getByTestId('payments-list').locator('span.tabular-nums').first();
    const box = await amount.boundingBox();
    expect(box).not.toBeNull();
    const lineHeight = await amount.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
    expect(box!.height).toBeLessThan(lineHeight * 1.5);
  });

  test('custom categories: create, use in expense, see in stats, delete folds to Other', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail('cats', testInfo.workerIndex + Date.now());
    await signIn(page, email);

    await page.getByTestId('new-group-btn').click();
    await page.getByTestId('group-name-input').fill('Kategorie');
    await page.getByTestId('create-group-submit').click();
    await page.getByText('Kategorie').click();

    // Create the category (axe-check the open sheet too).
    await openGroupSheet(page, 'categories');
    const sheetA11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(sheetA11y.violations, JSON.stringify(sheetA11y.violations, null, 2)).toEqual([]);
    await page.getByTestId('category-name-input').fill('Pivo');
    await page.getByTestId('category-icon-beer').click();
    await page.getByTestId('category-add-btn').click();
    await expect(page.getByText('Pivo')).toBeVisible();
    await closeSheet(page);

    // Use it in an expense via the grid.
    await page.getByTestId('add-expense-open').click();
    await page.getByTestId('expense-amount-input').fill('240');
    await page.getByTestId('expense-title-input').fill('Bečka');
    await page.getByTestId('expense-category-row').click();
    // New groups seed default categories, so pick the "Pivo" chip specifically.
    await page
      .getByTestId(/^category-chip-custom:/)
      .filter({ hasText: 'Pivo' })
      .click();
    await page.getByTestId('add-expense-submit').click();

    // Stats show the custom name.
    await openGroupSheet(page, 'stats');
    await expect(page.getByTestId('spend-stats').getByText('Pivo')).toBeVisible();
    await closeSheet(page);

    // Delete Pivo → its amount folds into the built-in Other bucket. (Seeded
    // default categories remain, so target Pivo's row and assert it's gone.)
    await openGroupSheet(page, 'categories');
    page.once('dialog', (d) => void d.accept());
    await page
      .getByTestId(/^category-row-/)
      .filter({ hasText: 'Pivo' })
      .getByTestId(/^category-delete-/)
      .click();
    await expect(page.getByTestId(/^category-row-/).filter({ hasText: 'Pivo' })).toHaveCount(0);
    await closeSheet(page);

    await openGroupSheet(page, 'stats');
    await expect(page.getByTestId('spend-stats').getByText(/Ostatní|Other/)).toBeVisible();
    await expect(page.getByTestId('spend-stats').getByText('Pivo')).toHaveCount(0);
  });
});
