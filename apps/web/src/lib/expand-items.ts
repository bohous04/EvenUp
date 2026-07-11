/**
 * Expand receipt line items with a whole quantity > 1 into that many individual
 * lines, so each unit can be assigned to a different person in the itemized
 * split (e.g. "3× Čokoláda 75.00" → three "Čokoláda" rows of 25.00).
 *
 * The line's `totalMinorUnits` is the source of truth — it's what reconciles
 * against the receipt's grand total — so the split is derived from it and always
 * sums back to it. When the total doesn't divide evenly, the leftover minor
 * units land on the first rows (penny distribution), keeping the sum exact.
 */

/** Max units a single line expands into — guards against a mis-read quantity
 * (e.g. an OCR'd "500") exploding the editor into hundreds of rows. */
const MAX_EXPAND = 50;

export interface QuantityItem {
  name: string;
  /** Original (e.g. pre-translation) name, carried through onto every row. */
  originalName?: string;
  quantity: number;
  totalMinorUnits: number;
}

export interface ExpandedItem {
  name: string;
  originalName?: string;
  totalMinorUnits: number;
}

export function expandItemQuantities(items: readonly QuantityItem[]): ExpandedItem[] {
  const out: ExpandedItem[] = [];
  for (const it of items) {
    const n = it.quantity;
    // Only whole quantities within the cap expand; fractional (weighed goods)
    // and pathological counts stay as a single editable line.
    if (Number.isInteger(n) && n >= 2 && n <= MAX_EXPAND) {
      const base = Math.trunc(it.totalMinorUnits / n);
      const remainder = it.totalMinorUnits - base * n;
      for (let i = 0; i < n; i++) {
        out.push({
          name: it.name,
          originalName: it.originalName,
          totalMinorUnits: base + (i < remainder ? 1 : 0),
        });
      }
    } else {
      out.push({
        name: it.name,
        originalName: it.originalName,
        totalMinorUnits: it.totalMinorUnits,
      });
    }
  }
  return out;
}
