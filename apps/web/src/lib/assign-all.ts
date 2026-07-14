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
