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

export type ItemizedBuild =
  | { ok: true; items: { name?: string; totalMinorUnits: number; memberIds: string[] }[]; total: number }
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
  if (parsed.some((it) => it.memberIds.length === 0)) return { ok: false, error: 'ocr.assignItems' };
  const built = parsed.map((it) => ({
    name: it.name,
    totalMinorUnits: it.minor as number,
    memberIds: it.memberIds,
  }));
  const total = built.reduce((a, it) => a + it.totalMinorUnits, 0);
  return { ok: true, items: built, total };
}
