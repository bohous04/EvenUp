# Itemized-expense editing + multi-page receipt viewer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist and fully edit itemized (receipt) expense line-items, and page through a multi-page receipt in an in-app lightbox.

**Architecture:** `ITEMIZED` expenses currently discard their item detail (only per-member `splits` are stored). Persist `ReceiptItem`+`ItemAssignment` on create/update, return them to the client, extract the OCR item-editor into a shared `ItemizedEditor`, use it in the edit form, and add a paged receipt lightbox. No schema migration (tables already exist).

**Tech Stack:** TypeScript, tRPC, zod, Prisma (Postgres), Next.js/React, Vitest, Playwright, `@evenup/core` split math.

## Global Constraints

- **No DB migration** — `ReceiptItem`/`ItemAssignment` already exist (Transaction back-relation is `receiptItems`; `ItemAssignment.receiptItem` is `onDelete: Cascade`).
- **Balances/splits math is unchanged** — items are ADDITIONAL detail persisted alongside the existing per-member `splits`; never change `planExpense`/`splitCreateData`/how `splits` are computed or stored.
- **Backward compatible** — existing itemized expenses have no stored items and MUST keep editing as `EXACT` (the current fallback); only new/updated ones get items. Do NOT modify `apps/mobile/**`.
- **OCR flow must keep working** — after extracting `ItemizedEditor`, the OCR review UI behaves identically and keeps every existing `data-testid` (`ocr-items`, `ocr-item-name-{i}`, `ocr-item-price-{i}`, `ocr-item-remove-{i}`, `ocr-add-item`, `ocr-total`, `ocr-per-person`, `ocr-person-{id}`).
- **Prettier must pass** — run `pnpm format` on changed files before committing; `pnpm format:check` is a CI gate.
- **Icons, never emoji.** Commits must NOT contain a `Co-Authored-By` trailer. Every task ends green (typecheck + its tests). Run `@evenup/api` tests with `DATABASE_URL=postgresql://evenup:evenup@localhost:55434/evenup_test` (throwaway Postgres already running); web unit/e2e use the `@evenup/web` filter (NOT `web`).

---

### Task 1: Persist + return itemized line-items (API)

**Files:**

- Modify: `packages/api/src/routers/transaction.ts` (`transactionInclude` ~30-34, `shapeTransaction` ~44-55, `createExpense` ~147-181, `updateExpense` ~294-328)
- Test: `packages/api/src/routers/integration.test.ts`

**Interfaces:**

- Produces: `shapeTransaction` output gains `items: { name: string; totalMinorUnits: number; memberIds: string[] }[]` (empty when none). This flows into `RouterOutputs['transaction']['list'][number]` and thus the web `EditableTransaction`.

- [ ] **Step 1: Write the failing integration tests**

In `packages/api/src/routers/integration.test.ts`, add a describe covering persistence (reuse the existing `seedGroupWithMembers` helper). Use exact-amount itemized items so payer total matches:

```ts
describe('itemized expense line-items', () => {
  it('persists ReceiptItems + assignments on create and returns them', async () => {
    const { caller, group, members } = await seedGroupWithMembers();
    await caller.transaction.createExpense({
      groupId: group.id,
      title: 'Albert',
      currency: 'CZK',
      date: new Date('2026-07-11'),
      payers: [{ memberId: members.olivia.id, amountMinorUnits: 6000 }],
      split: {
        type: 'ITEMIZED',
        items: [
          { name: 'Mléko', totalMinorUnits: 2000, memberIds: [members.olivia.id] },
          { name: 'Chléb', totalMinorUnits: 4000, memberIds: [members.olivia.id, members.petr.id] },
        ],
      },
    });
    const list = await caller.transaction.list({ groupId: group.id });
    const tx = list.find((t) => t.title === 'Albert')!;
    expect(tx.items).toHaveLength(2);
    expect(tx.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Mléko',
          totalMinorUnits: 2000,
          memberIds: [members.olivia.id],
        }),
        expect.objectContaining({ name: 'Chléb', totalMinorUnits: 4000 }),
      ]),
    );
    // Balances still computed from splits, unchanged: 2000 to olivia alone + 4000 split 2 ways.
    expect(tx.splitType).toBe('ITEMIZED');
  });

  it('replaces items on update and drops them when switching to a non-itemized split', async () => {
    const { caller, group, members } = await seedGroupWithMembers();
    const created = await caller.transaction.createExpense({
      groupId: group.id,
      title: 'R',
      currency: 'CZK',
      date: new Date('2026-07-11'),
      payers: [{ memberId: members.olivia.id, amountMinorUnits: 3000 }],
      split: {
        type: 'ITEMIZED',
        items: [{ name: 'A', totalMinorUnits: 3000, memberIds: [members.olivia.id] }],
      },
    });
    // Edit the items.
    await caller.transaction.updateExpense({
      transactionId: created.id,
      groupId: group.id,
      title: 'R',
      currency: 'CZK',
      date: new Date('2026-07-11'),
      payers: [{ memberId: members.olivia.id, amountMinorUnits: 5000 }],
      split: {
        type: 'ITEMIZED',
        items: [
          { name: 'B', totalMinorUnits: 2000, memberIds: [members.olivia.id] },
          { name: 'C', totalMinorUnits: 3000, memberIds: [members.petr.id] },
        ],
      },
    });
    let tx = (await caller.transaction.list({ groupId: group.id })).find(
      (t) => t.id === created.id,
    )!;
    expect(tx.items.map((i) => i.name).sort()).toEqual(['B', 'C']);
    // Switch to EQUAL — items must be gone.
    await caller.transaction.updateExpense({
      transactionId: created.id,
      groupId: group.id,
      title: 'R',
      currency: 'CZK',
      date: new Date('2026-07-11'),
      payers: [{ memberId: members.olivia.id, amountMinorUnits: 5000 }],
      split: {
        type: 'EQUAL',
        members: [{ memberId: members.olivia.id }, { memberId: members.petr.id }],
      },
    });
    tx = (await caller.transaction.list({ groupId: group.id })).find((t) => t.id === created.id)!;
    expect(tx.items).toEqual([]);
    expect(tx.splitType).toBe('EQUAL');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @evenup/api test integration`
Expected: FAIL (`tx.items` is undefined; itemized items not persisted).

- [ ] **Step 3: Include items + shape them**

In `packages/api/src/routers/transaction.ts`, extend `transactionInclude`:

```ts
const transactionInclude = {
  payers: { include: { member: true } },
  splits: { include: { member: true } },
  receipt: { select: { id: true, storageKeys: true } },
  receiptItems: { include: { assignments: true } },
} satisfies Prisma.TransactionInclude;
```

In `shapeTransaction`, destructure `receiptItems` from `tx` and add to the returned object:

```ts
    items: receiptItems.map((ri) => ({
      name: ri.name,
      totalMinorUnits: Number(ri.totalMinorUnits),
      memberIds: ri.assignments.map((a) => a.memberId),
    })),
```

(Add `receiptItems` to the `const { receipt, splits, ...rest } = tx;` destructure so it isn't spread raw.)

- [ ] **Step 4: Add a shared nested-create helper + wire create/update**

Near the top of the router module add:

```ts
/** Nested `receiptItems` create for an ITEMIZED split — persists the item detail
 *  alongside the per-member splits (balances are unaffected). `undefined` for
 *  non-itemized splits so callers can drop items instead. */
function itemizedReceiptItemsCreate(split: CreateExpenseInput['split']) {
  if (split.type !== 'ITEMIZED') return undefined;
  return split.items.map((it) => ({
    name: it.name ?? '',
    totalMinorUnits: fromMinor(it.totalMinorUnits),
    assignments: { create: it.memberIds.map((memberId) => ({ memberId })) },
  }));
}
```

Import `CreateExpenseInput` from `../schemas.js` if not already imported.

In `createExpense`, before the `transaction.create`, compute `const receiptItemsCreate = itemizedReceiptItemsCreate(input.split);` and add to the `data` object (after `splits`):

```ts
        ...(receiptItemsCreate ? { receiptItems: { create: receiptItemsCreate } } : {}),
```

In `updateExpense`, compute the same `const receiptItemsCreate = itemizedReceiptItemsCreate(input.split);` and add to the `data` object (after `splits`):

```ts
        receiptItems: {
          deleteMany: {},
          ...(receiptItemsCreate ? { create: receiptItemsCreate } : {}),
        },
```

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm -w typecheck && pnpm --filter @evenup/api test integration`
Expected: PASS.

- [ ] **Step 6: Format + commit**

```bash
pnpm format
git add packages/api/src/routers/transaction.ts packages/api/src/routers/integration.test.ts
git commit -m "feat(api): persist and return itemized expense line-items"
```

---

### Task 2: Extract shared `ItemizedEditor` (web refactor, OCR unchanged)

**Files:**

- Create: `apps/web/src/components/itemized-editor.tsx`
- Modify: `apps/web/src/components/ocr-scan.tsx`

**Interfaces:**

- Produces: `ItemizedEditor` React component, an exported item type, and an exported price parser:

```ts
export interface EditorItem {
  name: string;
  priceText: string;
  assigned: Set<string>;
}
/** Parse an item's price text to minor units, or null if invalid/non-positive. */
export function itemPriceToMinor(priceText: string, currency: string): number | null;
export function ItemizedEditor(props: {
  items: EditorItem[];
  onChange: (next: EditorItem[]) => void;
  members: { id: string; displayName: string; initials: string; color: string }[];
  baseCurrency: string;
}): JSX.Element;
```

- [ ] **Step 1: Create `itemized-editor.tsx`**

Move the post-scan item UI out of `ocr-scan.tsx` into a new presentational component. It renders, for `items`:

- one row per item: a name `Input` (`data-testid="ocr-item-name-{i}"`), a price `Input` (`data-testid="ocr-item-price-{i}"`, `inputMode="decimal"`, right-aligned), a remove button (`data-testid="ocr-item-remove-{i}"`), and the member `MemberChip`s toggling assignment; the unassigned amber styling and `ocr.unassigned` badge;
- an "add item" ghost button (`data-testid="ocr-add-item"`, `ocr.addItem`);
- the running total row (`AmountText` `data-testid="ocr-total"`) — sum of `priceToMinor(priceText)`;
- the per-person breakdown block (`data-testid="ocr-per-person"`, `ocr.perPerson`, rows `ocr-person-{id}`) computed with `splitItemized` from `@evenup/core`.

Move `priceToMinor` from `ocr-scan.tsx` into this file and **export it as `itemPriceToMinor`** (the edit form reuses it), and move the `perMember` computation here too. All mutations go through `onChange(nextItems)` (patch name/price, toggle a member, remove, add-empty). Keep the exact class names/testids so the OCR e2e is unaffected. Icons (`Trash2`, `Plus`, `AlertCircle`) from `@/components/icons`.

- [ ] **Step 2: Use it from `ocr-scan.tsx`**

In `ocr-scan.tsx`: keep `ScanItem`/`items` state but rename its type usage to `EditorItem` (identical shape) or import `EditorItem`. Replace the inline item-list JSX (the `data-testid="ocr-items"` block) with:

```tsx
<div className="space-y-3" data-testid="ocr-items">
  <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('ocr.assignItems')}</p>
  <ItemizedEditor items={items} onChange={setItems} members={members} baseCurrency={baseCurrency} />
  {/* payer select + save/cancel buttons stay here, unchanged */}
</div>
```

Remove the now-duplicated helpers/JSX that moved into `ItemizedEditor` (`priceToMinor` if unused elsewhere, `patchItem`, `toggleAssign`, `removeItem`, `addItem`, the `perMember`/`runningTotal` blocks, and their imports if no longer used). Keep the `save()` logic (it reads `items`); keep `payerId` select and Save/Cancel. Do not change the pre-scan picker or scan flow.

- [ ] **Step 3: Typecheck + web unit + OCR e2e**

Run: `pnpm -w typecheck && pnpm --filter @evenup/web test`
Then rebuild + run the OCR e2e (production bundle; e2e Postgres on 55433 already up):

```
DATABASE_URL="postgresql://evenup:pass@localhost:55433/evenup" BETTER_AUTH_SECRET=e2e-secret-000000000000000000000000 ENCRYPTION_KEY=0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0 pnpm --filter @evenup/web build
pnpm --filter @evenup/web exec playwright test --project=chromium critical-flow
```

Expected: PASS (both OCR tests — single-image and multi-screenshot — still green, proving the extraction preserved behavior).

- [ ] **Step 4: Format + commit**

```bash
pnpm format
git add apps/web/src/components/itemized-editor.tsx apps/web/src/components/ocr-scan.tsx
git commit -m "refactor(web): extract shared ItemizedEditor from OcrScan"
```

---

### Task 3: Itemized editing in the edit form

**Files:**

- Modify: `apps/web/src/components/add-expense-form.tsx`
- Modify: `apps/web/e2e/critical-flow.spec.ts`

**Interfaces:**

- Consumes: `ItemizedEditor`/`EditorItem` (Task 2); `editing.items` (Task 1).

- [ ] **Step 1: Add ITEMIZED to the form's split handling**

In `add-expense-form.tsx`:

- Change `type SplitType = 'EQUAL' | 'EXACT' | 'SHARES' | 'PERCENTAGE';` to include `'ITEMIZED'`, and add `ITEMIZED: 'split.itemized'` to `SPLIT_LABELS`. (Add the `split.itemized` key to `cs.ts` + `en.ts` — cs: `'Po položkách'`, en: `'By items'`.)
- Add state: `const [itemRows, setItemRows] = useState<EditorItem[]>([]);` and import `ItemizedEditor`, `itemPriceToMinor`, `type EditorItem` from `@/components/itemized-editor`.

- [ ] **Step 2: Prefill itemized items when present**

In the `editing` effect (~260-308), before the `SHARES/PERCENTAGE/EQUAL/else` chain, add:

```ts
if (editing.splitType === 'ITEMIZED' && editing.items && editing.items.length > 0) {
  setSplitType('ITEMIZED');
  setItemRows(
    editing.items.map((it) => ({
      name: it.name,
      priceText: minorToDecimalString(Math.abs(it.totalMinorUnits), editing.currency),
      assigned: new Set(it.memberIds),
    })),
  );
  setFxRate('');
  setRecurrence('none');
  setOpenRow(null);
  setError(null);
  return; // handled — skip the EXACT fallback
}
```

Leave the existing chain intact so a legacy itemized row (no `items`) still falls through to the `EXACT` fallback.

- [ ] **Step 3: Render the itemized editor + derive the total**

In the form body, when `splitType === 'ITEMIZED'`, render `<ItemizedEditor items={itemRows} onChange={setItemRows} members={members} baseCurrency={currency} />` in place of the member-picker + per-member split inputs, and make the top amount **display the derived sum** (read-only in this mode) rather than an editable field. Compute `const itemizedTotalMinor = itemRows.reduce((s, it) => s + (itemPriceToMinor(it.priceText, currency) ?? 0), 0);` and show `minorToDecimalString(itemizedTotalMinor, currency)` as the top amount. Keep the split-type dropdown so the user can switch away.

- [ ] **Step 4: Submit an ITEMIZED payload**

In `submit`/the payload branches (~394-440), add an `if (splitType === 'ITEMIZED')` branch that builds:

```ts
const parsed = itemRows.map((it) => ({
  name: it.name.trim() || undefined,
  minor: itemPriceToMinor(it.priceText, currency),
  memberIds: [...it.assigned],
}));
if (parsed.some((it) => it.minor == null)) {
  setError(t('split.sumMismatch'));
  return;
}
if (parsed.some((it) => it.memberIds.length === 0)) {
  setError(t('ocr.assignItems'));
  return;
}
const items = parsed.map((it) => ({
  name: it.name,
  totalMinorUnits: it.minor!,
  memberIds: it.memberIds,
}));
const total = items.reduce((a, it) => a + it.totalMinorUnits, 0);
runMutation({
  groupId,
  title: title.trim() || t('expense.title'),
  currency,
  date: new Date(date),
  category,
  payers: [{ memberId: payerId, amountMinorUnits: total }],
  split: { type: 'ITEMIZED', items },
});
return;
```

(Mirror the exact validation `ocr-scan.tsx` `save()` uses. `runMutation` already routes to `updateExpense` in edit mode.)

- [ ] **Step 5: E2E — edit an itemized expense and see/change items**

In `critical-flow.spec.ts`, extend the existing OCR test (or add one) so after saving the OCR itemized expense it re-opens the expense for edit, asserts `ocr-item-name-0` shows the item, changes a price, saves, and the transaction total reflects the change. (Reuse `expense-row`/edit affordances already used by `transaction-edit.spec.ts`; if simpler, put this in `transaction-edit.spec.ts`.)

- [ ] **Step 6: Typecheck + web unit + e2e; format + commit**

Run: `pnpm -w typecheck && pnpm --filter @evenup/web test`, rebuild, `playwright test --project=chromium critical-flow` (and `transaction-edit` if used). Expected: PASS.

```bash
pnpm format
git add apps/web/src/components/add-expense-form.tsx apps/web/e2e packages/i18n/src/locales/cs.ts packages/i18n/src/locales/en.ts
git commit -m "feat(web): edit itemized expenses with the shared ItemizedEditor"
```

---

### Task 4: Multi-page receipt lightbox viewer

**Files:**

- Create: `apps/web/src/components/receipt-viewer.tsx`
- Modify: `apps/web/src/components/group-detail.tsx` (receipt link ~205-215)
- Modify: `packages/i18n/src/locales/cs.ts`, `packages/i18n/src/locales/en.ts`
- Modify: `apps/web/e2e/critical-flow.spec.ts`

**Interfaces:**

- Consumes: `receiptId: string`, `pageCount: number`, the serve route `/api/receipts/{id}?page=N`.

- [ ] **Step 1: Build `ReceiptViewer`**

Create `apps/web/src/components/receipt-viewer.tsx`: a modal/lightbox (reuse the existing `Sheet`/modal primitive if one fits, else a fixed-overlay `div`) that shows `<img src={`/api/receipts/${receiptId}?page=${page}`} data-testid="receipt-viewer-img" />` with Prev/Next buttons (`data-testid="receipt-prev"`/`receipt-next"`), a `page+1 / pageCount` counter (`data-testid="receipt-counter"`), a close button, and a per-page "open original" link (`/api/receipts/{id}?page={page}` `target="_blank"` — the fallback for a PDF page an `<img>` can't render). Clamp paging to `[0, pageCount-1]`. Props: `{ receiptId, pageCount, onClose }`.

- [ ] **Step 2: Wire it into the transactions list**

In `group-detail.tsx`, replace the receipt link block so:

- `tx.receiptPageCount > 1`: a `<button data-testid="view-receipt">` (keep the testid) that opens `<ReceiptViewer receiptId={tx.receiptId} pageCount={tx.receiptPageCount} onClose={...} />` (local state for which tx's viewer is open).
- `tx.receiptPageCount === 1` (or the `hasReceiptImage` single case): keep the existing `<a href="/api/receipts/{id}" target="_blank">` link (works for one image and for a PDF).

- [ ] **Step 3: i18n**

Add keys (cs + en): `receipt.prev` (`Předchozí`/`Previous`), `receipt.next` (`Další`/`Next`), `receipt.openOriginal` (`Otevřít originál`/`Open original`), `receipt.pageOf` (`Stránka {n} z {total}`/`Page {n} of {total}`), `receipt.close` (`Zavřít`/`Close`).

- [ ] **Step 4: E2E — page through a multi-page receipt**

In `critical-flow.spec.ts`, in the multi-screenshot test, after saving keep both pages (don't remove one), then click `view-receipt`, assert `receipt-viewer-img` visible and `receipt-counter` shows `1`/`2`, click `receipt-next`, assert the counter advances, close.

- [ ] **Step 5: Typecheck + web unit + e2e; format + commit**

Run: `pnpm -w typecheck && pnpm --filter @evenup/web test`, rebuild, `playwright test --project=chromium critical-flow`. Expected: PASS.

```bash
pnpm format
git add apps/web/src/components/receipt-viewer.tsx apps/web/src/components/group-detail.tsx apps/web/e2e packages/i18n/src/locales/cs.ts packages/i18n/src/locales/en.ts
git commit -m "feat(web): page through multi-page receipts in a lightbox"
```

---

### Task 5: Full regression + verification

- [ ] **Step 1: Whole-suite regression**

Run (DB envs as above):

```
pnpm -w typecheck
pnpm exec turbo run test      # @evenup/api (DATABASE_URL 55434), core, i18n, web unit
pnpm format:check             # CI gate — must be clean
pnpm --filter @evenup/web build && pnpm --filter @evenup/web exec playwright test --project=chromium
```

Expected: all green (full critical-flow + transaction-edit e2e). Fix any fallout in the owning task's files.

- [ ] **Step 2: Manual verification (human)**

Use `/run` or the `verify` skill on evenup.lnrt.cz (VIP): create a fresh OCR expense, edit it → confirm the individual items appear and an edit persists; import a multi-screenshot receipt → "view receipt (N)" pages through the lightbox. (This step is for the human — it needs a real VIP account and receipts.)

- [ ] **Step 3: Commit any regression fixes**

```bash
pnpm format && git add -A && git commit -m "test: itemized editing + receipt viewer regression pass"
```

## Self-Review notes

- **Spec coverage:** §2 persist-on-create → Task 1; §3 return items → Task 1; §4 persist-on-update → Task 1; §5 shared ItemizedEditor → Task 2; §6 itemized edit mode → Task 3; §7 lightbox → Task 4; §8 tests → across Tasks 1-5.
- **Ordering:** Task 1 (API) first so `editing.items` exists for Task 3; Task 2 (extract) before Task 3 (use); Task 4 independent; Task 5 final regression.
- **Type consistency:** `items: { name; totalMinorUnits: number; memberIds: string[] }[]` (API `shapeTransaction` ↔ client `editing.items`), `EditorItem { name; priceText; assigned: Set }` (ItemizedEditor ↔ ocr-scan ↔ edit form), `itemizedReceiptItemsCreate`, `receiptItems` relation name — all used identically across tasks.
- **No migration** — reconfirmed: `Transaction.receiptItems` + `ItemAssignment onDelete: Cascade` already in schema.
