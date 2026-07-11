/** Return a new array with the element at `from` moved to the clamped `to` index. */
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const clampedTo = Math.min(Math.max(to, 0), next.length - 1);
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return arr;
  next.splice(clampedTo, 0, moved);
  return next;
}
