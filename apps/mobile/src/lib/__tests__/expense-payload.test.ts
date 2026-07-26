import { buildSplitPayload, type SplitFormState } from '../expense-payload';

const base: SplitFormState = {
  splitType: 'EQUAL',
  amount: '100',
  currency: 'CZK',
  selectedIds: ['a', 'b'],
  exactById: {},
  weightById: {},
  percentById: {},
};

test('EQUAL builds member list and total in minor units', () => {
  const r = buildSplitPayload(base);
  expect(r).toEqual({
    ok: true,
    split: { type: 'EQUAL', members: [{ memberId: 'a' }, { memberId: 'b' }] },
    totalMinor: 10000,
  });
});

test('EXACT totals the per-member amounts', () => {
  const r = buildSplitPayload({
    ...base,
    splitType: 'EXACT',
    exactById: { a: '30', b: '70' },
  });
  expect(r).toEqual({
    ok: true,
    split: {
      type: 'EXACT',
      members: [
        { memberId: 'a', exactMinorUnits: 3000 },
        { memberId: 'b', exactMinorUnits: 7000 },
      ],
    },
    totalMinor: 10000,
  });
});

test('SHARES rounds weights and defaults missing to 1', () => {
  const r = buildSplitPayload({ ...base, splitType: 'SHARES', weightById: { a: '2' } });
  expect(r).toMatchObject({
    ok: true,
    split: {
      type: 'SHARES',
      members: [
        { memberId: 'a', weight: 2 },
        { memberId: 'b', weight: 1 },
      ],
    },
  });
});

test('PERCENTAGE must sum to 100', () => {
  const bad = buildSplitPayload({
    ...base,
    splitType: 'PERCENTAGE',
    percentById: { a: '50', b: '40' },
  });
  expect(bad).toEqual({ ok: false, error: 'split.percentMismatch' });

  const good = buildSplitPayload({
    ...base,
    splitType: 'PERCENTAGE',
    percentById: { a: '50', b: '50' },
  });
  expect(good).toMatchObject({ ok: true, split: { type: 'PERCENTAGE' } });
});

test('no selected members is an error', () => {
  expect(buildSplitPayload({ ...base, selectedIds: [] })).toEqual({
    ok: false,
    error: 'split.sumMismatch',
  });
});

test('zero total is an error', () => {
  expect(buildSplitPayload({ ...base, amount: '0' })).toEqual({
    ok: false,
    error: 'split.sumMismatch',
  });
});
