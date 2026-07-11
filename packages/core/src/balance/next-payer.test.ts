import { describe, expect, test } from 'vitest';
import * as fc from 'fast-check';
import { rankNextRound, type NextPayerCandidate } from './next-payer.js';

const c = (
  memberId: string,
  balanceMinorUnits: number,
  shareWeight = 1,
  lastPaidAt: number | null = null,
): NextPayerCandidate => ({ memberId, balanceMinorUnits, shareWeight, lastPaidAt });

const ids = (r: readonly NextPayerCandidate[]) => r.map((x) => x.memberId);

describe('rankNextRound — selection', () => {
  test('names the single deepest debtor, with the next level as runner-up', () => {
    const r = rankNextRound(
      [c('petr', -89_000), c('filip', -145_000), c('olivia', 234_000)],
      180_000,
    );
    expect(r).not.toBeNull();
    expect(ids(r!.payers)).toEqual(['filip']);
    expect(ids(r!.runnerUp)).toEqual(['petr']);
  });

  test('names every debtor tied at the deepest debt and suppresses the runner-up', () => {
    const r = rankNextRound([c('petr', -25_000), c('jana', -25_000), c('olivia', 50_000)], 90_000);
    expect(ids(r!.payers)).toEqual(['jana', 'petr']); // never-paid: ordered by memberId
    expect(r!.runnerUp).toEqual([]);
  });

  test('the runner-up is the next distinct level only, not every shallower debtor', () => {
    const r = rankNextRound(
      [c('deep', -90_000), c('mid', -60_000), c('shallow', -30_000), c('rich', 180_000)],
      90_000,
    );
    expect(ids(r!.payers)).toEqual(['deep']);
    expect(ids(r!.runnerUp)).toEqual(['mid']);
  });

  test('a tied next level is named together in the runner-up', () => {
    const r = rankNextRound(
      [c('deep', -90_000), c('midA', -60_000), c('midB', -60_000), c('rich', 210_000)],
      90_000,
    );
    expect(ids(r!.payers)).toEqual(['deep']);
    expect(ids(r!.runnerUp)).toEqual(['midA', 'midB']);
  });

  test('a creditor is never a payer, even beside a single debtor', () => {
    const r = rankNextRound([c('rich', 100_000), c('poor', -100_000)], 90_000);
    expect(ids(r!.payers)).toEqual(['poor']);
    expect(r!.runnerUp).toEqual([]);
  });

  test('returns null when nobody owes anything', () => {
    expect(rankNextRound([c('a', 0), c('b', 0)], 90_000)).toBeNull();
  });
});

describe('rankNextRound — ordering', () => {
  test('tied payers order by least recently paid, never-paid first', () => {
    const r = rankNextRound(
      [
        c('recent', -180_000, 1, 5_000),
        c('never', -180_000, 1, null),
        c('old', -180_000, 1, 1_000),
      ],
      180_000,
    );
    expect(ids(r!.payers)).toEqual(['never', 'old', 'recent']);
  });

  test('a total tie falls back to memberId, deterministically', () => {
    const r = rankNextRound([c('b', -180_000), c('a', -180_000)], 180_000);
    expect(ids(r!.payers)).toEqual(['a', 'b']);
  });
});

describe('rankNextRound — clearsGate', () => {
  test('true when every tied payer clears the gate', () => {
    // W = 3, E = 180_000 -> gate is b <= -60_000. Both payers sit exactly on it.
    const r = rankNextRound(
      [c('petr', -60_000), c('jana', -60_000), c('olivia', 120_000)],
      180_000,
    );
    expect(ids(r!.payers)).toEqual(['jana', 'petr']);
    expect(r!.clearsGate).toBe(true);
  });

  test('false when a tied payer one koruna short of the gate is present', () => {
    const r = rankNextRound(
      [c('petr', -59_999), c('jana', -59_999), c('olivia', 119_998)],
      180_000,
    );
    expect(r!.clearsGate).toBe(false);
  });

  test('false when one tied payer clears the gate and another does not', () => {
    // W = 4, E = 180_000. Gate = -E(W-w)/2W: w=2 -> -45_000, w=1 -> -67_500.
    // Both sit at -45_000: the heavy-share member clears it, the light one does not.
    const r = rankNextRound(
      [c('heavy', -45_000, 2), c('light', -45_000, 1), c('rich', 90_000, 1)],
      180_000,
    );
    expect(ids(r!.payers)).toEqual(['heavy', 'light']);
    expect(r!.clearsGate).toBe(false);
  });

  test('false when the deepest debtor is shallower than the gate', () => {
    const r = rankNextRound([c('petr', -25_000), c('jana', -25_000), c('olivia', 50_000)], 90_000);
    expect(r!.clearsGate).toBe(false);
  });

  test('false when the typical expense or total weight is unknowable, but payers still stand', () => {
    const zeroE = rankNextRound([c('a', -100_000), c('b', 100_000)], 0);
    expect(ids(zeroE!.payers)).toEqual(['a']);
    expect(zeroE!.clearsGate).toBe(false);

    const negE = rankNextRound([c('a', -100_000), c('b', 100_000)], -1);
    expect(negE!.clearsGate).toBe(false);

    const zeroW = rankNextRound([c('a', -100_000, 0), c('b', 100_000, 0)], 180_000);
    expect(ids(zeroW!.payers)).toEqual(['a']);
    expect(zeroW!.clearsGate).toBe(false);
  });
});

describe('rankNextRound — properties', () => {
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

  test('a payer is always a debtor', () => {
    fc.assert(
      fc.property(uniqueCandidates, positiveE, (cs, E) => {
        const r = rankNextRound(cs, E);
        for (const p of r?.payers ?? []) expect(p.balanceMinorUnits).toBeLessThan(0);
      }),
    );
  });

  test('every payer holds the minimum balance among all candidates', () => {
    fc.assert(
      fc.property(uniqueCandidates, positiveE, (cs, E) => {
        const r = rankNextRound(cs, E);
        if (!r) return;
        const min = cs.reduce((m, x) => Math.min(m, x.balanceMinorUnits), Infinity);
        for (const p of r.payers) expect(p.balanceMinorUnits).toBe(min);
      }),
    );
  });

  test('null exactly when there is no debtor', () => {
    fc.assert(
      fc.property(uniqueCandidates, positiveE, (cs, E) => {
        const hasDebtor = cs.some((x) => x.balanceMinorUnits < 0);
        expect(rankNextRound(cs, E) === null).toBe(!hasDebtor);
      }),
    );
  });

  test('a runner-up is strictly shallower than a payer, and only exists for a lone payer', () => {
    fc.assert(
      fc.property(uniqueCandidates, positiveE, (cs, E) => {
        const r = rankNextRound(cs, E);
        if (!r || r.runnerUp.length === 0) return;
        expect(r.payers).toHaveLength(1);
        for (const u of r.runnerUp) {
          expect(u.balanceMinorUnits).toBeGreaterThan(r.payers[0]!.balanceMinorUnits);
          expect(u.balanceMinorUnits).toBeLessThan(0);
        }
      }),
    );
  });

  test('is invariant under permutation of its input', () => {
    fc.assert(
      fc.property(uniqueCandidates, positiveE, (cs, E) => {
        const forward = rankNextRound(cs, E);
        const backward = rankNextRound([...cs].reverse(), E);
        expect(backward === null).toBe(forward === null);
        if (!forward || !backward) return;
        expect(ids(backward.payers)).toEqual(ids(forward.payers));
        expect(ids(backward.runnerUp)).toEqual(ids(forward.runnerUp));
        expect(backward.clearsGate).toBe(forward.clearsGate);
      }),
    );
  });
});
