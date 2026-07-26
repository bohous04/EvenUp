import { decimalStringToMinor } from '@evenup/core';
import type { MessageKey } from '@evenup/i18n';

export interface EditorItem {
  name: string;
  /** Price as an editable decimal string in the expense currency. */
  priceText: string;
  assigned: Set<string>;
}

/** Parse an item's price text to minor units, or null if invalid/non-positive. */
export function itemPriceToMinor(priceText: string, currency: string): number | null {
  try {
    const minor = decimalStringToMinor(priceText.trim() || '0', currency);
    return minor > 0 ? minor : null;
  } catch {
    return null;
  }
}

/**
 * Toggle a member across every item: if already on all, remove from all;
 * otherwise add to all. Never mutates the input (ported from web lib/assign-all).
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

export type ReceiptTotalStatus = 'none' | 'match' | 'mismatch';

export interface ReceiptTotalCheck {
  /** Receipt's printed grand total in minor units; null when blank/invalid. */
  receiptTotalMinor: number | null;
  /** Sum of the editor rows (a priceless row counts as 0), 0 when there's no total to check against. */
  itemsSumMinor: number;
  /** receiptTotal - itemsSum. Positive = items undershoot the receipt. */
  diffMinor: number;
  status: ReceiptTotalStatus;
}

/**
 * Live discrepancy between the edited item rows and the receipt's printed total
 * (mirrors web's `ocr-scan.tsx`). Only sums the rows when a total exists —
 * without one there is no discrepancy to show, just an unchecked editor.
 *
 * A row with no valid price counts as 0 rather than voiding the check: the item
 * still needs a price before saving, and hiding the mismatch until then would
 * withhold the very hint that a price is missing.
 */
export function checkReceiptTotal(
  items: EditorItem[],
  receiptTotalText: string,
  currency: string,
): ReceiptTotalCheck {
  const receiptTotalMinor = itemPriceToMinor(receiptTotalText, currency);
  if (receiptTotalMinor === null) {
    return { receiptTotalMinor: null, itemsSumMinor: 0, diffMinor: 0, status: 'none' };
  }
  const itemsSumMinor = items.reduce(
    (a, it) => a + (itemPriceToMinor(it.priceText, currency) ?? 0),
    0,
  );
  const diffMinor = receiptTotalMinor - itemsSumMinor;
  return {
    receiptTotalMinor,
    itemsSumMinor,
    diffMinor,
    status: diffMinor === 0 ? 'match' : 'mismatch',
  };
}

/**
 * Difference to book as a single proportional balancing line so the saved
 * expense matches the receipt's printed total (mirrors web's `save()`). Zero
 * unless the user opted in and a receipt total exists — their item sum wins by
 * default. A negative result (items over-count) is handled by core's
 * abs-weighted allocation.
 */
export function reconcileDiff(
  itemsTotalMinor: number,
  receiptTotalMinor: number | null,
  reconcile: boolean,
): number {
  if (!reconcile || receiptTotalMinor === null) return 0;
  return receiptTotalMinor - itemsTotalMinor;
}

export type ItemizedBuild =
  | {
      ok: true;
      items: { name?: string; totalMinorUnits: number; memberIds: string[] }[];
      total: number;
    }
  | { ok: false; error: MessageKey };

/** Validate editor rows and build the ITEMIZED split items + total (mirrors web save()). */
export function buildItemizedItems(items: EditorItem[], currency: string): ItemizedBuild {
  if (items.length === 0) return { ok: false, error: 'ocr.assignItems' };
  const parsed = items.map((it) => ({
    name: it.name.trim() || undefined,
    minor: itemPriceToMinor(it.priceText, currency),
    memberIds: [...it.assigned],
  }));
  if (parsed.some((it) => it.minor === null)) return { ok: false, error: 'ocr.itemNeedsPrice' };
  if (parsed.some((it) => it.memberIds.length === 0))
    return { ok: false, error: 'ocr.assignItems' };
  const built = parsed.map((it) => ({
    name: it.name,
    totalMinorUnits: it.minor as number,
    memberIds: it.memberIds,
  }));
  const total = built.reduce((a, it) => a + it.totalMinorUnits, 0);
  return { ok: true, items: built, total };
}
