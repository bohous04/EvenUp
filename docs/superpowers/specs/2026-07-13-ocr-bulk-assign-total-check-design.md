# OCR review: bulk-assign & editable total check — design

**Date:** 2026-07-13
**Status:** Approved (design)
**Area:** `apps/web/src/components` (receipt OCR review + shared itemized editor)

## Problem

Two friction points in the post-OCR item-review screen:

1. **No bulk assignment.** Members are assigned per item only — tapping `MemberChip`s
   on each row (`itemized-editor.tsx`). When one person shares the whole receipt (or
   everyone shares everything), the user must tap every row individually. There is no
   "mark this person on all items" control.

2. **The receipt total can't be checked when OCR misses it.** `receiptTotalMinor` in
   `ocr-scan.tsx` is set **only** from OCR (`res.result.totalMinorUnits`) and is
   **read-only**. The item-sum-vs-total reconcile banner (`showReconcile`) therefore only
   appears when OCR detected a total. If OCR read the total wrong or not at all, the user
   has no way to enter the total printed on the receipt and no check runs.

## Goal

- Add a per-member control to assign/unassign a member across **all** items at once.
- Let the user **type/edit the receipt's grand total** and always check the item sum
  against it — reusing the price input the app already has.

## Non-goals (YAGNI)

- No hard block on mismatch. The screen warns and offers the existing proportional
  **reconcile** (a balancing line); `save()` logic is unchanged.
- No changes to OCR parsing (`packages/api/src/ocr`) or to the manual expense form's
  own top-level amount handling.

## Approach

### Task 1 — "Assign to all items" toggle row (shared `ItemizedEditor`)

Placed in `itemized-editor.tsx`, so it appears in **both** consumers of the component:
the OCR scan flow (`ocr-scan.tsx`) and the manual itemized expense form
(`add-expense-form.tsx`). Both already mount `ItemizedEditor`; the bonus bulk control is
useful in both.

- A **"Assign to all items"** header row above the item list: one `MemberChip`
  (size `lg`, matching the per-item chips) per member.
- **Toggle semantics** — a chip is `selected` when that member is assigned to **every**
  item. Tapping it:
  - member on all items → **remove** them from all items;
  - otherwise → **add** them to all items.
- The row is **hidden** when there are 0 items or 0 members (a vacuous "on all" is
  meaningless and would render a permanently-selected chip).
- **a11y:** the row is wrapped in `role="group"` with an `aria-label` (`ocr.assignAll`);
  each chip keeps its existing per-member `aria-label`/`aria-pressed` from `MemberChip`.

**Pure logic extraction (testability, repo pattern):** the toggle is a pure function
`assignAllToItems(items, memberId): EditorItem[]` in a new `apps/web/src/lib/assign-all.ts`,
mirroring `lib/move-item.ts` / `lib/expand-items.ts`. `ItemizedEditor` calls it from an
`onChange` handler. It computes `allHave = items.length > 0 && items.every(it =>
it.assigned.has(memberId))` and returns items with the member added to every row's
`assigned` set (or removed from every row when `allHave`).

### Task 2 — Editable receipt total + item-sum check (`ocr-scan.tsx` only)

The receipt's printed grand total is OCR-flow-specific, so this stays in `ocr-scan.tsx`
(the manual form has its own top-level amount and is left untouched).

- Replace the read-only `receiptTotalMinor` **state** with an editable
  `receiptTotalText` string state:
  - **pre-filled** from OCR on scan success — `minorToDecimalString(total, baseCurrency)`
    when `res.result.totalMinorUnits > 0`, else `''`;
  - **reset** to `''` in `resetScan()` alongside the other scan state.
- **Derive** `receiptTotalMinor` from the text via the **existing** `itemPriceToMinor`
  helper (returns `null` for empty/invalid/non-positive). All downstream logic —
  `itemsSumMinor`, `totalDiffMinor`, `showReconcile`, and the reconcile diff inside
  `save()` — reads this derived value, so their behavior is unchanged.
- Add an always-visible **"Receipt total"** field in review mode, rendered with the
  **same price `Input`** (`@/components/ui`) the item rows use: right-aligned,
  `inputMode="decimal"`, labeled `ocr.receiptTotal`.
- **The check** beneath the field:
  - total entered **and** `diff !== 0` → the existing amber mismatch banner (items sum ·
    difference · reconcile checkbox). The banner no longer renders the receipt total as a
    read-only `AmountText` — the editable field above is now the source.
  - total entered **and** `diff === 0` → a small green **"matches"** confirmation
    (`ocr.totalMatches`).
  - no total entered → no check; the empty field invites entry.
- Because the total is now user-enterable, the check **works even when OCR misses the
  total** — closing the current gap.

## Consequences

- One tap assigns a member to the whole receipt (and one tap clears them), in both the
  scan flow and the manual itemized form.
- The user can correct or supply the receipt total by hand and immediately see whether
  their items add up, then reconcile if they choose — even on receipts where OCR failed
  to read the total.
- `save()` and the reconcile machinery are behaviorally unchanged (they read a derived
  `receiptTotalMinor` instead of a state one).

## Files touched

- `apps/web/src/lib/assign-all.ts` — **new** pure toggle helper.
- `apps/web/src/components/itemized-editor.tsx` — bulk-assign header row.
- `apps/web/src/components/ocr-scan.tsx` — editable receipt-total field; `receiptTotalText`
  state; derived `receiptTotalMinor`; match/mismatch check.
- `packages/i18n/src/locales/en.ts`, `cs.ts` — new keys `ocr.assignAll`, `ocr.totalMatches`.

## Testing

Following the repo split (vitest for pure `lib/` logic, Playwright e2e for UI wiring; no
React component unit tests exist):

- **vitest** — `lib/assign-all.test.ts`:
  - member on no items → added to all;
  - member on some items → added to all;
  - member on all items → removed from all;
  - empty item list → unchanged (no-op).
- **Playwright** — extend `apps/web/e2e/critical-flow.spec.ts`:
  - bulk-assign a member from the header row → every row shows them selected; tap again →
    cleared;
  - edit the "Receipt total" field → items sum / difference / reconcile update live,
    including entering a total when OCR returned none (mismatch banner appears), and a
    matching total showing the confirmation.
