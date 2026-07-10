import { describe, expect, test } from 'vitest';
import * as fc from 'fast-check';
import { suggestNextPayer, type NextPayerCandidate } from './next-payer.js';

/** Three equal-weight members; E = 180_000 puts the gate at exactly -60_000. */
const c = (
  memberId: string,
  balanceMinorUnits: number,
  shareWeight = 1,
  lastPaidAt: number | null = null,
): NextPayerCandidate => ({ memberId, balanceMinorUnits, shareWeight, lastPaidAt });

const ids = (r: readonly NextPayerCandidate[]) => r.map((x) => x.memberId);

describe('suggestNextPayer — the gate', () => {
  test('admits a member exactly on the boundary and rejects one koruna short', () => {
    const onBoundary = [c('a', -60_000), c('b', 30_000), c('c', 30_000)];
    expect(ids(suggestNextPayer(onBoundary, 180_000))).toEqual(['a']);

    const shortOfBoundary = [c('a', -59_999), c('b', 30_000), c('c', 29_999)];
    expect(ids(suggestNextPayer(shortOfBoundary, 180_000))).toEqual([]);
  });

  test('never names a creditor or a square member', () => {
    const r = suggestNextPayer([c('rich', 234_000), c('square', 0), c('poor', -145_000)], 180_000);
    expect(ids(r)).toEqual(['poor']);
  });

  test('a larger share qualifies at a shallower debt', () => {
    // W = 4. Gate = -E(W-w)/2W  =>  w=2 -> -45_000,  w=1 -> -67_500.
    const heavy = [c('heavy', -45_000, 2), c('x', 1, 1), c('y', 1, 1)];
    expect(ids(suggestNextPayer(heavy, 180_000))).toEqual(['heavy']);

    const light = [c('light', -45_000, 1), c('x', 1, 2), c('y', 1, 1)];
    expect(ids(suggestNextPayer(light, 180_000))).toEqual([]);
  });

  test('returns empty when the typical expense or total weight is not positive', () => {
    expect(suggestNextPayer([c('a', -100_000)], 0)).toEqual([]);
    expect(suggestNextPayer([c('a', -100_000)], -1)).toEqual([]);
    expect(suggestNextPayer([c('a', -100_000, 0)], 180_000)).toEqual([]);
  });

  test('is empty when every member is square', () => {
    expect(suggestNextPayer([c('a', 0), c('b', 0)], 180_000)).toEqual([]);
  });
});

describe('suggestNextPayer — ordering', () => {
  test('ranks the deepest debtor first', () => {
    const r = suggestNextPayer(
      [c('petr', -89_000), c('filip', -145_000), c('olivia', 234_000)],
      180_000,
    );
    expect(ids(r)).toEqual(['filip', 'petr']);
  });

  test('breaks exact balance ties by least recently paid, never-paid first', () => {
    const r = suggestNextPayer(
      [
        c('recent', -180_000, 1, 5_000),
        c('never', -180_000, 1, null),
        c('old', -180_000, 1, 1_000),
      ],
      180_000,
    );
    expect(ids(r)).toEqual(['never', 'old', 'recent']);
  });

  test('breaks a total tie by memberId, deterministically', () => {
    const r = suggestNextPayer([c('b', -180_000), c('a', -180_000)], 180_000);
    expect(ids(r)).toEqual(['a', 'b']);
  });
});

describe('suggestNextPayer — properties', () => {
  const candidateArb = fc.record({
    memberId: fc.string({ minLength: 1, maxLength: 6 }),
    balanceMinorUnits: fc.integer({ min: -1_000_000, max: 1_000_000 }),
    shareWeight: fc.integer({ min: 1, max: 1_000 }),
    lastPaidAt: fc.option(fc.integer({ min: 0, max: 1_000_000 }), { nil: null }),
  });

  const uniqueCandidates = fc
    .array(candidateArb, { minLength: 1, maxLength: 12 })
    .map((cs) => cs.map((x, i) => ({ ...x, memberId: `${x.memberId}-${i}` })));

  const positiveE = fc.integer({ min: 1, max: 1_000_000 });

  test('never returns a member with balance >= 0', () => {
    fc.assert(
      fc.property(uniqueCandidates, positiveE, (cs, E) => {
        for (const r of suggestNextPayer(cs, E)) expect(r.balanceMinorUnits).toBeLessThan(0);
      }),
    );
  });

  test('every named member is moved no further from zero by paying', () => {
    fc.assert(
      fc.property(uniqueCandidates, positiveE, (cs, E) => {
        const W = cs.reduce((s, x) => s + x.shareWeight, 0);
        for (const r of suggestNextPayer(cs, E)) {
          const projected = r.balanceMinorUnits + E * (1 - r.shareWeight / W);
          expect(Math.abs(projected)).toBeLessThanOrEqual(Math.abs(r.balanceMinorUnits) + 1e-9);
        }
      }),
    );
  });

  test('result is sorted by balance ascending', () => {
    fc.assert(
      fc.property(uniqueCandidates, positiveE, (cs, E) => {
        const r = suggestNextPayer(cs, E);
        for (let i = 1; i < r.length; i++)
          expect(r[i - 1]!.balanceMinorUnits).toBeLessThanOrEqual(r[i]!.balanceMinorUnits);
      }),
    );
  });

  test('is invariant under permutation of its input', () => {
    fc.assert(
      fc.property(uniqueCandidates, positiveE, (cs, E) => {
        const forward = ids(suggestNextPayer(cs, E));
        const backward = ids(suggestNextPayer([...cs].reverse(), E));
        expect(backward).toEqual(forward);
      }),
    );
  });
});
