/**
 * Local-calendar date helpers for the expense date field. Everything works in
 * the browser's local timezone on purpose: an expense dated "22 June" must stay
 * on the 22nd for the person who entered it, regardless of UTC offset — which is
 * why we never round-trip through `toISOString()` or `new Date('YYYY-MM-DD')`
 * (both interpret the date as UTC midnight and can shift it a day).
 */

/** A `Date` as a local `YYYY-MM-DD` string. */
export function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Today as a local `YYYY-MM-DD` string. */
export function todayLocalIso(): string {
  return localIso(new Date());
}

/**
 * Parse `YYYY-MM-DD` as LOCAL noon — stays on the picked day in every timezone.
 * Falls back to "now" for a malformed/empty input (e.g. a receipt date the model
 * returned in another format) rather than feeding `Number`'s NaN-tolerant parsing
 * bogus year/month/day parts downstream.
 */
export function parseLocalDate(iso: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return new Date();
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0);
}
