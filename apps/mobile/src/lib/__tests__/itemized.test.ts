import { assignAllToItems, buildItemizedItems, itemPriceToMinor, type EditorItem } from '../itemized';

const item = (name: string, priceText: string, assigned: string[]): EditorItem => ({
  name,
  priceText,
  assigned: new Set(assigned),
});

test('itemPriceToMinor parses positive amounts and rejects junk', () => {
  expect(itemPriceToMinor('12,50', 'CZK')).toBe(1250);
  expect(itemPriceToMinor('0', 'CZK')).toBeNull();
  expect(itemPriceToMinor('abc', 'CZK')).toBeNull();
});

test('assignAllToItems toggles a member across all rows', () => {
  const items = [item('a', '1', []), item('b', '2', [])];
  const added = assignAllToItems(items, 'm1');
  expect(added.every((it) => it.assigned.has('m1'))).toBe(true);
  const removed = assignAllToItems(added, 'm1');
  expect(removed.every((it) => it.assigned.has('m1'))).toBe(false);
  // original untouched
  expect(items[0]!.assigned.has('m1')).toBe(false);
});

test('buildItemizedItems produces split items + total', () => {
  const r = buildItemizedItems([item('Beer', '50', ['a']), item('Fries', '30', ['a', 'b'])], 'CZK');
  expect(r).toEqual({
    ok: true,
    items: [
      { name: 'Beer', totalMinorUnits: 5000, memberIds: ['a'] },
      { name: 'Fries', totalMinorUnits: 3000, memberIds: ['a', 'b'] },
    ],
    total: 8000,
  });
});

test('buildItemizedItems flags a missing price', () => {
  expect(buildItemizedItems([item('x', '', ['a'])], 'CZK')).toEqual({
    ok: false,
    error: 'ocr.itemNeedsPrice',
  });
});

test('buildItemizedItems flags an unassigned item', () => {
  expect(buildItemizedItems([item('x', '10', [])], 'CZK')).toEqual({
    ok: false,
    error: 'ocr.assignItems',
  });
});
