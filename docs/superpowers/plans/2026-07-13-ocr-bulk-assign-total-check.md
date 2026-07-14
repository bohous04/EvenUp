# OCR review: bulk-assign & editable total check — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-member "assign to all items" toggle row to the itemized editor, and make the OCR receipt total user-editable so the item sum is always checked against it.

**Architecture:** A pure `assignAllToItems` helper (unit-tested) backs a bulk-assign chip row rendered by the shared `ItemizedEditor` (appears in both the OCR scan flow and the manual itemized form). In `ocr-scan.tsx` the read-only `receiptTotalMinor` state becomes an editable `receiptTotalText` string, with `receiptTotalMinor` derived from it via the existing `itemPriceToMinor` helper — so `save()` and the reconcile machinery are unchanged, but the check now works even when OCR misses the total.

**Tech Stack:** Next.js + React (App Router), TypeScript, Tailwind, tRPC; vitest (pure `lib/` logic), Playwright (`e2e/`). Monorepo via pnpm + turbo; web package is `@evenup/web`.

## Global Constraints

- Use SVG icon components, never emoji glyphs — the "matches" confirmation uses the `Check` icon from `@/components/icons`.
- The editable receipt-total field reuses the existing price `Input` from `@/components/ui` (right-aligned, `inputMode="decimal"`).
- No changes to OCR parsing (`packages/api/src/ocr`) or to the manual expense form's own top-level amount handling.
- `save()`'s reconcile logic is behaviorally unchanged — it reads a *derived* `receiptTotalMinor` instead of a state one.
- Every new i18n key must be added to **both** `packages/i18n/src/locales/cs.ts` and `en.ts` (the `MessageKey` type derives from `cs.ts`; `en` must satisfy `Record<MessageKey, string>`, so a key in only one file fails typecheck).
- Bulk-assign chips render inside the `ocr-items` container; their row carries `data-testid="ocr-assign-all"` so tests select the bulk chip without colliding with per-item chips (Playwright `getByRole` name matching is substring-based).

---

### Task 1: `assignAllToItems` pure helper

**Files:**
- Create: `apps/web/src/lib/assign-all.ts`
- Test: `apps/web/src/lib/assign-all.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `assignAllToItems<T extends { assigned: Set<string> }>(items: T[], memberId: string): T[]` — returns a new array where, if `memberId` is on **every** item, it is removed from all; otherwise it is added to all. Empty input returns a new empty array (no-op). Each returned item is a shallow copy with a fresh `assigned` Set (never mutates inputs).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/assign-all.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { assignAllToItems } from './assign-all';

const item = (...ids: string[]) => ({ name: 'x', assigned: new Set(ids) });

describe('assignAllToItems', () => {
  it('adds the member to every item when on none', () => {
    const next = assignAllToItems([item(), item()], 'a');
    expect(next.map((it) => [...it.assigned])).toEqual([['a'], ['a']]);
  });

  it('adds the member to every item when on only some', () => {
    const next = assignAllToItems([item('a'), item()], 'a');
    expect(next.every((it) => it.assigned.has('a'))).toBe(true);
  });

  it('removes the member from every item when on all', () => {
    const next = assignAllToItems([item('a', 'b'), item('a')], 'a');
    expect(next.map((it) => [...it.assigned])).toEqual([['b'], []]);
  });

  it('is a no-op for an empty list', () => {
    expect(assignAllToItems([], 'a')).toEqual([]);
  });

  it('does not mutate the input items', () => {
    const input = [item('a')];
    assignAllToItems(input, 'a');
    expect([...input[0]!.assigned]).toEqual(['a']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @evenup/web exec vitest run src/lib/assign-all.test.ts`
Expected: FAIL — `Failed to resolve import "./assign-all"` / `assignAllToItems is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Create `apps/web/src/lib/assign-all.ts`:

```ts
/**
 * Toggle a member across every item: if the member is already assigned to all
 * items, remove them from all; otherwise add them to all. Returns a new array
 * of shallow-copied items with fresh `assigned` sets (never mutates the input).
 * Backs the "assign to all items" row in ItemizedEditor.
 */
export function assignAllToItems<T extends { assigned: Set<string> }>(
  items: T[],
  memberId: string,
): T[] {
  const onAll = items.length > 0 && items.every((it) => it.assigned.has(memberId));
  return items.map((it) => {
    const assigned = new Set(it.assigned);
    if (onAll) assigned.delete(memberId);
    else assigned.add(memberId);
    return { ...it, assigned };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @evenup/web exec vitest run src/lib/assign-all.test.ts`
Expected: PASS — 5 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/assign-all.ts apps/web/src/lib/assign-all.test.ts
git commit -m "feat(web): add assignAllToItems helper for bulk item assignment"
```

---

### Task 2: Bulk-assign row in `ItemizedEditor`

**Files:**
- Modify: `packages/i18n/src/locales/en.ts` (after the `'ocr.itemNeedsPrice'` line)
- Modify: `packages/i18n/src/locales/cs.ts` (after the `'ocr.itemNeedsPrice'` line)
- Modify: `apps/web/src/components/itemized-editor.tsx`
- Modify: `apps/web/e2e/critical-flow.spec.ts` (both OCR tests)

**Interfaces:**
- Consumes: `assignAllToItems(items, memberId)` from Task 1; `t('ocr.assignAll')`.
- Produces: a `<div data-testid="ocr-assign-all" role="group">` bulk-assign row rendered above the item list whenever there is ≥1 item and ≥1 member.

- [ ] **Step 1: Add the `ocr.assignAll` i18n key (both locales)**

In `packages/i18n/src/locales/en.ts`, add immediately after the `'ocr.itemNeedsPrice': ...` line:

```ts
  'ocr.assignAll': 'Assign to all items',
```

In `packages/i18n/src/locales/cs.ts`, add immediately after the `'ocr.itemNeedsPrice': ...` line:

```ts
  'ocr.assignAll': 'Přiřadit ke všem položkám',
```

- [ ] **Step 2: Import the helper in `itemized-editor.tsx`**

Add this import beneath the existing `import { AlertCircle, Trash2, Plus } from '@/components/icons';` line:

```ts
import { assignAllToItems } from '@/lib/assign-all';
```

- [ ] **Step 3: Add the `assignAll` handler**

In `itemized-editor.tsx`, immediately after the existing `addItem` function:

```ts
  function addItem() {
    onChange([...items, { name: '', priceText: '', assigned: new Set<string>() }]);
  }
  function assignAll(memberId: string) {
    onChange(assignAllToItems(items, memberId));
  }
```

- [ ] **Step 4: Render the bulk-assign row above the item list**

In `itemized-editor.tsx`, the `return (` currently starts with `<>` then `{items.map((it, i) => {`. Insert the bulk row between `<>` and `{items.map(...)}`:

```tsx
  return (
    <>
      {members.length > 0 && items.length > 0 ? (
        <div
          role="group"
          aria-label={t('ocr.assignAll')}
          data-testid="ocr-assign-all"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
        >
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {t('ocr.assignAll')}
          </span>
          {members.map((m) => (
            <MemberChip
              key={m.id}
              initials={m.initials}
              color={m.color}
              name={m.displayName}
              imageUrl={m.imageUrl}
              selected={items.every((it) => it.assigned.has(m.id))}
              onClick={() => assignAll(m.id)}
              size="lg"
            />
          ))}
        </div>
      ) : null}

      {items.map((it, i) => {
```

(The `items.every(...)` selected check is safe from a vacuous-true because the surrounding `items.length > 0` guard prevents the row rendering for an empty list.)

- [ ] **Step 5: Update the first OCR e2e test to assign via the bulk chip**

In `apps/web/e2e/critical-flow.spec.ts`, replace the block at the first OCR test (currently):

```ts
    // Assign every item to Petr by tapping his chip in each item.
    const petrChips = page.getByTestId('ocr-items').getByRole('button', { name: 'Petr' });
    for (const chip of await petrChips.all()) await chip.click();

    // Per-person sum reflects the assignment (Petr owes the whole 75.10).
    await expect(page.getByTestId('ocr-per-person')).toContainText(/75[.,]10/);
```

with:

```ts
    // Assign every item to Petr in one tap via the "assign to all items" row.
    await page.getByTestId('ocr-assign-all').getByRole('button', { name: 'Petr' }).click();

    // Per-person sum reflects the assignment (Petr owes the whole 75.10).
    await expect(page.getByTestId('ocr-per-person')).toContainText(/75[.,]10/);
```

- [ ] **Step 6: Update the second OCR e2e test to assign via the bulk chip**

In the same file, in the `multi-screenshot receipt import` test, replace (currently):

```ts
    // Assign every item to Petr (required before saving) and save.
    const petrChips = page.getByTestId('ocr-items').getByRole('button', { name: 'Petr' });
    for (const chip of await petrChips.all()) await chip.click();
    await page.getByTestId('ocr-save-btn').click();
```

with:

```ts
    // Assign every item to Petr in one tap (required before saving) and save.
    await page.getByTestId('ocr-assign-all').getByRole('button', { name: 'Petr' }).click();
    await page.getByTestId('ocr-save-btn').click();
```

- [ ] **Step 7: Typecheck, lint, and run unit tests**

Run: `pnpm --filter @evenup/i18n typecheck && pnpm --filter @evenup/web typecheck && pnpm --filter @evenup/web lint && pnpm --filter @evenup/web test`
Expected: all PASS (no type error from the new key; eslint clean; vitest incl. `assign-all` green).

- [ ] **Step 8: Commit**

```bash
git add packages/i18n/src/locales/en.ts packages/i18n/src/locales/cs.ts apps/web/src/components/itemized-editor.tsx apps/web/e2e/critical-flow.spec.ts
git commit -m "feat(web): add assign-to-all-items row to itemized editor"
```

---

### Task 3: Editable receipt total + item-sum check in `ocr-scan.tsx`

**Files:**
- Modify: `packages/i18n/src/locales/en.ts` (after the `'ocr.assignAll'` line from Task 2)
- Modify: `packages/i18n/src/locales/cs.ts` (after the `'ocr.assignAll'` line from Task 2)
- Modify: `apps/web/src/components/ocr-scan.tsx`
- Modify: `apps/web/e2e/critical-flow.spec.ts` (first OCR test)

**Interfaces:**
- Consumes: existing `itemPriceToMinor`, `minorToDecimalString`, the `Input` UI component, the `Check` icon, `t('ocr.receiptTotal')`, `t('ocr.totalMatches')`.
- Produces: an editable `data-testid="ocr-receipt-total-input"` field; a `data-testid="ocr-total-matches"` confirmation when the item sum equals the entered total; the existing `data-testid="ocr-total-mismatch"` banner otherwise.

- [ ] **Step 1: Add the `ocr.totalMatches` i18n key (both locales)**

In `packages/i18n/src/locales/en.ts`, add immediately after the `'ocr.assignAll'` line:

```ts
  'ocr.totalMatches': 'Items match the receipt total',
```

In `packages/i18n/src/locales/cs.ts`, add immediately after the `'ocr.assignAll'` line:

```ts
  'ocr.totalMatches': 'Položky sedí na částku z účtenky',
```

- [ ] **Step 2: Add `Input` and `Check` imports in `ocr-scan.tsx`**

Change:

```ts
import { Button, Select } from '@/components/ui';
```

to:

```ts
import { Button, Input, Select } from '@/components/ui';
```

And change the icons import:

```ts
import {
  Camera,
  ImageIcon,
  AlertCircle,
  Trash2,
  FileText,
  ChevronUp,
  ChevronDown,
} from '@/components/icons';
```

to add `Check`:

```ts
import {
  Camera,
  ImageIcon,
  AlertCircle,
  Trash2,
  FileText,
  ChevronUp,
  ChevronDown,
  Check,
} from '@/components/icons';
```

- [ ] **Step 3: Replace the `receiptTotalMinor` state with an editable text state**

Change:

```ts
  const [receiptTotalMinor, setReceiptTotalMinor] = useState<number | null>(null);
```

to:

```ts
  // Receipt's printed grand total as an editable decimal string (pre-filled from
  // OCR, blank when OCR found none). Kept as text so the user can key in the
  // total by hand; the minor-unit value is derived below via itemPriceToMinor.
  const [receiptTotalText, setReceiptTotalText] = useState('');
```

- [ ] **Step 4: Reset the new state in `resetScan`**

In `resetScan`, change:

```ts
    setReceiptTotalMinor(null);
```

to:

```ts
    setReceiptTotalText('');
```

- [ ] **Step 5: Pre-fill the total from OCR on scan success**

In the `scan` mutation's `onSuccess`, change:

```ts
      setReceiptTotalMinor(res.result.totalMinorUnits > 0 ? res.result.totalMinorUnits : null);
```

to:

```ts
      setReceiptTotalText(
        res.result.totalMinorUnits > 0
          ? minorToDecimalString(res.result.totalMinorUnits, baseCurrency)
          : '',
      );
```

- [ ] **Step 6: Derive `receiptTotalMinor` and a `showMatch` flag**

Find the derivation block near the end of the component:

```ts
  const itemsSumMinor =
    receiptTotalMinor != null
      ? (items ?? []).reduce((a, it) => a + (itemPriceToMinor(it.priceText, baseCurrency) ?? 0), 0)
      : 0;
  const totalDiffMinor = receiptTotalMinor != null ? receiptTotalMinor - itemsSumMinor : 0;
  const showReconcile = receiptTotalMinor != null && totalDiffMinor !== 0;
```

Replace it with (adds the derived `receiptTotalMinor` above it and a `showMatch` flag below):

```ts
  // Receipt total in minor units, derived from the editable text (null when the
  // field is blank/invalid). save() and the reconcile machinery read this, so
  // their behavior is unchanged from when it was OCR-only state.
  const receiptTotalMinor = itemPriceToMinor(receiptTotalText, baseCurrency);
  const itemsSumMinor =
    receiptTotalMinor != null
      ? (items ?? []).reduce((a, it) => a + (itemPriceToMinor(it.priceText, baseCurrency) ?? 0), 0)
      : 0;
  const totalDiffMinor = receiptTotalMinor != null ? receiptTotalMinor - itemsSumMinor : 0;
  const showReconcile = receiptTotalMinor != null && totalDiffMinor !== 0;
  const showMatch = receiptTotalMinor != null && totalDiffMinor === 0;
```

- [ ] **Step 7: Render the editable total field + match/mismatch check**

In the review-mode JSX, find the block that starts right after the `<ItemizedEditor ... />` element — currently the `{showReconcile ? (` block. Replace the **entire** existing `{showReconcile ? ( ... ) : null}` block with:

```tsx
          {/* Editable receipt total: reuses the item price Input so the user can
              key in (or correct) the printed grand total, then see whether the
              items add up — even when OCR missed the total. */}
          <div className="flex items-center justify-between gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <label htmlFor="ocr-receipt-total" className="text-sm font-medium">
              {t('ocr.receiptTotal')}
            </label>
            <div className="w-28 shrink-0">
              <Input
                id="ocr-receipt-total"
                value={receiptTotalText}
                onChange={(e) => setReceiptTotalText(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                aria-label={t('ocr.receiptTotal')}
                data-testid="ocr-receipt-total-input"
                className="text-right"
              />
            </div>
          </div>

          {showMatch ? (
            <p
              className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400"
              data-testid="ocr-total-matches"
            >
              <Check size={14} aria-hidden />
              {t('ocr.totalMatches')}
            </p>
          ) : null}

          {showReconcile ? (
            <div
              className="rounded-lg border border-amber-300 bg-amber-50/70 p-3 dark:border-amber-500/40 dark:bg-amber-950/20"
              data-testid="ocr-total-mismatch"
            >
              <p className="flex items-center gap-1.5 text-sm font-medium text-amber-800 dark:text-amber-200">
                <AlertCircle size={14} aria-hidden />
                {t('ocr.totalMismatch')}
              </p>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-amber-700 dark:text-amber-300">
                <span>
                  {t('common.total')}:{' '}
                  <AmountText
                    minorUnits={itemsSumMinor}
                    currency={baseCurrency}
                    className="font-semibold"
                  />
                </span>
                <span>
                  {t('ocr.difference')}:{' '}
                  <AmountText
                    minorUnits={totalDiffMinor}
                    currency={baseCurrency}
                    className="font-semibold"
                  />
                </span>
              </div>
              <label className="mt-2 flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
                <input
                  type="checkbox"
                  checked={reconcile}
                  onChange={(e) => setReconcile(e.target.checked)}
                  data-testid="ocr-reconcile-toggle"
                  className="h-4 w-4 rounded border-amber-400 text-brand-600 focus-visible:ring-brand-600"
                />
                {t('ocr.reconcile')}
              </label>
            </div>
          ) : null}
```

(The old banner showed the receipt total as a read-only `AmountText`; that line is intentionally dropped because the editable field above is now the source of the total.)

- [ ] **Step 8: Add e2e assertions for the total check**

In `apps/web/e2e/critical-flow.spec.ts`, first OCR test, find:

```ts
    // Running sum is shown before saving (24.90 + 35.10 = 60.00).
    await expect(page.getByTestId('ocr-total')).toContainText(/60[.,]00/);

    // Inline editor: change the first item's price -> the sum recomputes live.
    await page.getByTestId('ocr-item-price-0').fill('40');
    await expect(page.getByTestId('ocr-total')).toContainText(/75[.,]10/);
```

Replace it with:

```ts
    // Running sum is shown before saving (24.90 + 35.10 = 60.00).
    await expect(page.getByTestId('ocr-total')).toContainText(/60[.,]00/);

    // Receipt total is pre-filled from OCR (60.00) and, with the item sum equal,
    // the "items match the receipt total" confirmation shows.
    await expect(page.getByTestId('ocr-receipt-total-input')).not.toHaveValue('');
    await expect(page.getByTestId('ocr-total-matches')).toBeVisible();

    // Inline editor: change the first item's price -> the sum recomputes live and
    // now differs from the receipt total, so the mismatch banner appears.
    await page.getByTestId('ocr-item-price-0').fill('40');
    await expect(page.getByTestId('ocr-total')).toContainText(/75[.,]10/);
    await expect(page.getByTestId('ocr-total-mismatch')).toBeVisible();

    // Keying the printed total in by hand to match the edited items clears the
    // mismatch — the sum check runs against the manually-entered total.
    await page.getByTestId('ocr-receipt-total-input').fill('75.10');
    await expect(page.getByTestId('ocr-total-mismatch')).toBeHidden();
    await expect(page.getByTestId('ocr-total-matches')).toBeVisible();
```

- [ ] **Step 9: Typecheck and lint**

Run: `pnpm --filter @evenup/i18n typecheck && pnpm --filter @evenup/web typecheck && pnpm --filter @evenup/web lint`
Expected: PASS (no type error from the new key or the `Input`/`Check` imports; eslint clean).

- [ ] **Step 10: Commit**

```bash
git add packages/i18n/src/locales/en.ts packages/i18n/src/locales/cs.ts apps/web/src/components/ocr-scan.tsx apps/web/e2e/critical-flow.spec.ts
git commit -m "feat(web): make OCR receipt total editable with live item-sum check"
```

---

### Task 4: End-to-end verification

**Files:** none (verification only).

**Interfaces:**
- Consumes: the running Playwright harness (`playwright.config.ts` auto-starts `next dev` with `AUTH_DEV_ECHO=true` and `OPENROUTER_BASE_URL` pointed at `/api/dev/ocr-mock`). Requires the local e2e Postgres per the project's e2e recipe.

- [ ] **Step 1: Run the OCR e2e specs**

Run: `pnpm --filter @evenup/web test:e2e -- critical-flow`
Expected: both OCR tests PASS — the bulk "assign to all items" chip assigns Petr to every row (per-person 75.10), the receipt-total field pre-fills and shows the match/mismatch check, and the itemized expense still saves with the edited total (75.10 → later 85.10).

- [ ] **Step 2: Full web test + typecheck sweep**

Run: `pnpm --filter @evenup/web test && pnpm --filter @evenup/web typecheck && pnpm --filter @evenup/web lint`
Expected: all PASS.

- [ ] **Step 3: No commit needed** — verification only. If any check fails, return to the owning task (Task 1–3) and fix before proceeding.

## Notes on the manual itemized form

Task 2's bulk-assign row also renders in `add-expense-form.tsx` (ITEMIZED mode) because it shares `ItemizedEditor` — this is intended and needs no separate change. The receipt-total field (Task 3) is scoped to `ocr-scan.tsx` only; the manual form keeps its own top-level amount.
