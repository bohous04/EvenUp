# OCR discount netting — design

**Date:** 2026-07-12
**Status:** Approved (design)
**Area:** `packages/api/src/ocr` (OCR receipt parsing)

## Problem

When a receipt contains a discount, OCR returns **two line items**: the product with
its positive price and a separate discount line (e.g. `Sleva -20`). The discount is
never subtracted from the product.

In the web review UI this negative line is worse than cosmetic: `itemPriceToMinor`
turns any price `≤ 0` into `null`, which flags the row "needs a price" and **blocks the
whole save** (`ocr-scan.tsx` — `save()` bails when any item's `minor === null`). The user
must manually delete or edit the discount row before they can save.

Discounts on the user's receipts apply to **specific items**, but the discount line is
sometimes printed **grouped at the end of the receipt** rather than directly under the
product it belongs to. A discount line is recognisable primarily by a **negative price**
(the minus sign at the amount).

## Goal

For a per-item discount, show **one** item with the discount already subtracted from its
base price (`Rohlík 25` + `Sleva -5` → `Rohlík 20`). Never let a leftover discount line
block saving.

## Non-goals

- Whole-basket discounts already baked into the printed grand `total` are **out of scope**;
  they keep being handled by the existing proportional **reconcile** flow, which the user
  confirmed works fine.
- No changes to the web UI components (`ocr-scan.tsx`, `itemized-editor.tsx`). The fix is
  entirely in OCR parsing so the UI receives clean, positive items.

## Approach (approved: B)

Two layers, both in `packages/api/src/ocr/openrouter-adapter.ts`.

### Layer 1 — Prompt (primary, does the real attribution)

Extend `BASE_PROMPT` with a discount instruction, roughly:

> When a line is a discount (sleva / discount / rabatt / zľava, shown as a negative
> amount), subtract it from the total price of the specific item it belongs to — even when
> the discount is listed at the end of the receipt, match it to its item by name/context.
> Do NOT return the discount as its own line item. Only return a standalone negative line
> for a whole-basket discount that cannot be attributed to a single item.

The model sees the full receipt (image + layout + names), so it is best placed to pair an
end-of-receipt discount with the right product. In the common case it returns a single
item with the net price, and no negative line at all.

### Layer 2 — Deterministic safety net in `normalize()`

Guards against the model still splitting the discount out. A discount line is identified by
a **negative `totalPrice`** (the minus at the price). For each parsed item with
`totalPrice < 0`:

- **Has an immediately-preceding positive item** → net it into that item (subtract the
  discount from the preceding item's total). The user sees one item with the reduced price.
- **Orphan** (no positive predecessor) → drop it from the emitted item list and fold its
  amount into the reconcile difference (existing `reconciliation` / `total` machinery), so
  the discount is still reflected proportionally and the save is **never blocked**.

After netting, recompute `itemsSumMinorUnits` and `matchesTotal` from the emitted items.

## Consequences

- Common case: the negative "needs a price" row disappears; the review list shows one item
  with the discount subtracted. Because `item sum == total`, the reconcile banner also
  disappears.
- Fallback case (model failed to net): the app degrades gracefully — one merged item, or a
  proportional reconcile — instead of a hard-blocked save.
- Edge: if there is no printed `total` to reconcile against, an orphan discount is dropped
  (slight under-application of the discount). Rare; acceptable.

## Files touched

- `packages/api/src/ocr/openrouter-adapter.ts` — `BASE_PROMPT` text; `normalize()` netting.

## Testing

- Unit tests on `normalize()` (the deterministic layer is fully testable without the LLM):
  - Product + adjacent negative discount → one item, net price; no negative items remain.
  - Discount grouped after several products, adjacent to one of them → nets into the
    preceding item.
  - Orphan leading negative line → removed from items, folded into reconcile diff; no
    `null`-priced/negative item leaks to the UI.
  - No discount → output unchanged (regression guard).
  - `itemsSumMinorUnits` / `matchesTotal` recomputed correctly after netting.
