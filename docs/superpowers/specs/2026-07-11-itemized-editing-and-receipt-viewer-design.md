# EvenUp — itemized-expense persistence + editing, and multi-page receipt viewer — design spec

> **Status:** approved design, ready to plan
> **Date:** 2026-07-11
> **Builds on:** OCR itemized expenses (`ocr-scan.tsx`, `transaction.createExpense` with `split.type: 'ITEMIZED'`) and multi-page receipt import (`2026-07-11-multi-page-receipt-import-design.md`).

## 1. Goal

Two user-reported gaps, fixed together (one branch, one deploy):

1. **Editing an itemized (receipt) expense shows no items.** Today an `ITEMIZED` split's item detail is **never persisted** — `planExpense` derives per-member `shares` from the items and only the resulting per-member `splits` are stored (like `EXACT`); the `ReceiptItem`/`ItemAssignment` tables exist but nothing writes them. So the edit form falls back to `EXACT` (`add-expense-form.tsx:286-289`). Fix: **persist the items** on create/update and give the edit form a **full itemized editor** (edit names, prices, per-member assignment; re-save as `ITEMIZED`).
2. **Viewing a multi-page receipt shows only one photo.** The serve route already supports `?page=N`, but the "view receipt" link opens page 0 only. Fix: an in-app **paged lightbox** for multi-page receipts.

### Confirmed decisions

1. **Full item editing** (not read-only): items are persisted and fully editable on edit, re-saved as `ITEMIZED`.
2. **Shared `ItemizedEditor` component** extracted from `ocr-scan.tsx` and reused by both OCR and the edit form (DRY + consistent UX). OCR flow re-verified (e2e) after the refactor.
3. **Lightbox** viewer for `receiptPageCount > 1`.
4. **Edit existing itemized only** — do NOT add manual "create itemized from scratch" to the split-type dropdown (YAGNI).
5. **No migration** — `ReceiptItem`/`ItemAssignment` tables already exist. **Existing** itemized expenses have no stored items and keep editing as `EXACT`; only newly created/updated ones get items.

### Non-goals

- Manual creation of an itemized expense from the add form (only OCR creates them; edit gains item support). Extra-charges editing UI (the `extraCharges` field stays server-side/OCR-agnostic). Retroactive backfill of items for old expenses.

## 2. Persist items on create (`ITEMIZED`)

`packages/api/src/routers/transaction.ts` `createExpense` (the `transaction.create` at ~147):

- When `input.split.type === 'ITEMIZED'`, add a nested `receiptItems` create alongside `payers`/`splits`:
  - one `ReceiptItem` per `split.items[i]`: `name` (`item.name ?? ''`), `totalMinorUnits: fromMinor(item.totalMinorUnits)`, `quantity: 1` (default), `unitPriceMinorUnits`/`taxRate` left null (the ITEMIZED input carries neither),
  - each item's `assignments` nested-create one `ItemAssignment` per `memberId`.
- For non-itemized splits, no `receiptItems` are written (unchanged).
- The per-member `splits` are still written exactly as today — balances/debt math is unchanged. Items are **additional** detail, not a replacement.

## 3. Return items to the client

`packages/api/src/routers/transaction.ts`:

- Extend `transactionInclude` with `receiptItems: { include: { assignments: true } }`.
- In `shapeTransaction`, map to a plain client shape: `items: receiptItems.map(ri => ({ name: ri.name, totalMinorUnits: Number(ri.totalMinorUnits), memberIds: ri.assignments.map(a => a.memberId) }))` (BigInt → number for superjson, mirroring the existing `totalMinorUnits` handling). Empty array when there are none.
- This flows through `transaction.list` (and any get) into the client `EditableTransaction`.

## 4. Persist items on update

`updateExpense` (the `transaction.update` at ~294) already accepts `ITEMIZED` (`updateExpenseInput = createExpenseInput.extend({ transactionId })`). Mirror the wholesale-replace pattern used for `payers`/`splits`:

- `receiptItems: { deleteMany: {}, create: <same nested create as §2 when ITEMIZED, else omitted> }`.
- When the edited split is **not** `ITEMIZED`, still `deleteMany: {}` so switching an itemized expense to `EQUAL`/`EXACT` drops its stale items.
- `ItemAssignment` rows cascade-delete with their `ReceiptItem` (`onDelete: Cascade`), so `deleteMany` on items is sufficient.

## 5. Shared `ItemizedEditor` (web)

New `apps/web/src/components/itemized-editor.tsx` — the item-assignment UI currently inline in `ocr-scan.tsx`: item rows (name input, price input, member chips to assign, remove), an "add item" button, a running total, and the per-person breakdown (via `splitItemized` from `@evenup/core`). Props: `items`, `onChange`, `members`, `baseCurrency`. Pure-ish presentational + local edit callbacks; no data fetching.

- `ocr-scan.tsx` is refactored to render `<ItemizedEditor>` for its post-scan review (same behavior, same `data-testid`s preserved so the OCR e2e keeps passing).
- The edit form renders the same component (see §6).

## 6. Itemized mode in the edit form

`apps/web/src/components/add-expense-form.tsx`:

- Add `ITEMIZED` to the form's `SplitType` handling and an `items` state.
- Prefill (the `editing` effect, ~260-308): when `editing.splitType === 'ITEMIZED'` **and** `editing.items?.length`, set `splitType='ITEMIZED'` and load `items` from `editing.items` (name, price text, assigned member set). Otherwise keep the existing behavior (itemized-without-items → `EXACT` fallback, unchanged for legacy rows).
- Render: when `splitType === 'ITEMIZED'`, show `<ItemizedEditor>` (total is **derived** from the item sum — the top amount field becomes read-only/driven by items, like OCR); the member-picker and EXACT/EQUAL/etc. inputs are hidden in this mode.
- Save: when `splitType === 'ITEMIZED'`, build `split: { type: 'ITEMIZED', items: items.map(it => ({ name, totalMinorUnits, memberIds })) }` and one payer for the derived total; call `updateExpense` (edit) — reusing the exact validation the OCR save already does.
- Switching the dropdown away from `ITEMIZED` to another split type behaves as today for that type (and §4 drops the items on save).

## 7. Multi-page receipt viewer (web)

`apps/web/src/components/group-detail.tsx` (receipt link at ~205-215) + a small new `ReceiptViewer` (can live in the same file or its own component):

- `receiptPageCount === 1`: unchanged — the current `<a href="/api/receipts/{id}" target="_blank">` (works for a single image and for a PDF).
- `receiptPageCount > 1`: the "view receipt (N)" control opens an in-app **lightbox modal** that renders `<img src="/api/receipts/{id}?page={n}">` with prev/next (and page dots/counter), for `n` in `0..N-1`. A per-page "open original" link (`?page={n}` in a new tab) is the fallback for a page that is a PDF (an `<img>` can't render it).
- Uses the existing hardened serve route; no API change.

## 8. Test strategy

- **API integration** (`@evenup/api`, DB): a created `ITEMIZED` expense persists N `ReceiptItem` rows with the right `ItemAssignment`s; `transaction.list` returns `items` with member ids; `updateExpense` replaces items (edit items → new rows, correct assignments); switching an itemized expense to `EQUAL` deletes its items; per-member `splits`/balances stay correct across all of the above.
- **Web unit**: any pure helper extracted for `ItemizedEditor` (e.g. per-person breakdown / total). No React-component test infra exists — component behavior is covered by e2e.
- **E2E** (hermetic, mocked OCR): the existing OCR flow still passes after the `ItemizedEditor` extraction; a new test edits an OCR-created itemized expense → items are visible → change an item/assignment → save → the change persists; a multi-page import → "view receipt (N)" pages through the lightbox.
- **Regression**: run the full `@evenup/api` + `@evenup/web` suites + typecheck + `format:check`.

## 9. Definition of Done

Items persisted on create/update; edit form shows and edits itemized items via the shared `ItemizedEditor`; multi-page receipts page through a lightbox; all suites + typecheck + prettier green; verified on evenup.lnrt.cz that a new OCR expense edits with its items and a multi-screenshot receipt pages through.
