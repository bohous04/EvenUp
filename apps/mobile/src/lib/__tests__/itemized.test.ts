import {
  assignAllToItems,
  buildItemizedItems,
  checkReceiptTotal,
  itemPriceToMinor,
  reconcileDiff,
  type EditorItem,
} from '../itemized';

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

test('checkReceiptTotal reports no check when the receipt total is blank or junk', () => {
  const items = [item('Beer', '50', ['a'])];
  expect(checkReceiptTotal(items, '', 'CZK')).toEqual({
    receiptTotalMinor: null,
    itemsSumMinor: 0,
    diffMinor: 0,
    status: 'none',
  });
  expect(checkReceiptTotal(items, 'abc', 'CZK').status).toBe('none');
});

test('checkReceiptTotal matches when the items sum to the receipt total', () => {
  const items = [item('Beer', '50', ['a']), item('Fries', '30', ['b'])];
  expect(checkReceiptTotal(items, '80', 'CZK')).toEqual({
    receiptTotalMinor: 8000,
    itemsSumMinor: 8000,
    diffMinor: 0,
    status: 'match',
  });
});

test('checkReceiptTotal reports the shortfall when the items undershoot', () => {
  const items = [item('Beer', '50', ['a'])];
  expect(checkReceiptTotal(items, '80', 'CZK')).toEqual({
    receiptTotalMinor: 8000,
    itemsSumMinor: 5000,
    diffMinor: 3000,
    status: 'mismatch',
  });
});

test('checkReceiptTotal reports a negative difference when the items overshoot', () => {
  const items = [item('Beer', '50', ['a']), item('Fries', '40', ['b'])];
  expect(checkReceiptTotal(items, '80', 'CZK')).toMatchObject({
    itemsSumMinor: 9000,
    diffMinor: -1000,
    status: 'mismatch',
  });
});

test('reconcileDiff stays out of the way unless the user opted in', () => {
  expect(reconcileDiff(5000, 8000, false)).toBe(0);
  expect(reconcileDiff(5000, null, true)).toBe(0);
});

test('reconcileDiff balances the shortfall up to the receipt total', () => {
  expect(reconcileDiff(5000, 8000, true)).toBe(3000);
});

test('reconcileDiff balances downwards when the items overshoot', () => {
  expect(reconcileDiff(9000, 8000, true)).toBe(-1000);
});

test('checkReceiptTotal counts a priceless row as zero rather than dropping the check', () => {
  const items = [item('Beer', '50', ['a']), item('Unknown', '', ['b'])];
  expect(checkReceiptTotal(items, '80', 'CZK')).toMatchObject({
    itemsSumMinor: 5000,
    diffMinor: 3000,
    status: 'mismatch',
  });
});
