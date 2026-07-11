/** Clamp a `?page=` query value to a valid index into a receipt's pages. */
export function resolveReceiptPage(pageCount: number, raw: string | null): number {
  const n = raw == null ? 0 : Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, Math.max(0, pageCount - 1));
}
