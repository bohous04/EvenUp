/**
 * Who should pay for the group's next shared expense (PRD §1.2, FR-6.1).
 *
 * Pure, deterministic, integer minor units — the same contract as `balance.ts`,
 * of which this is a derivative.
 *
 * Selection is simple and does not consult the gate: the card names every debtor
 * tied at the deepest debt. Simulation over 200 000 random zero-sum groups shows
 * the deepest debtor is among the optimal payers for settlement count — the only
 * objective EvenUp claims to minimize — in every case.
 *
 * The **gate** survives to say whether paying actually helps the members named.
 * With balance `b < 0`, typical expense `E`, own weight `w` and total weight `W`,
 * paying raises the payer's balance by `E·(1 − w/W)`, so "no further from zero"
 * (`|b + E·(1 − w/W)| ≤ |b|`) reduces to `2b + E·(1 − w/W) ≤ 0`, and multiplying
 * by `W > 0` clears the fraction:
 *
 *     2·b·W + E·(W − w) ≤ 0
 *
 * `clearsGate` requires this of **every** payer, not merely one: tied members can
 * hold different weights, and the confident wording promises that paying evens up
 * whoever takes the round.
 */

export interface NextPayerCandidate {
  readonly memberId: string;
  /** Net position in base-currency minor units: negative = owes. */
  readonly balanceMinorUnits: number;
  /** The member's `defaultShare`. */
  readonly shareWeight: number;
  /** Epoch ms of the last EXPENSE this member paid; null = never paid a round. */
  readonly lastPaidAt: number | null;
}

export interface NextRoundRanking {
  /** Every debtor tied at the deepest debt. Never empty; never holds a creditor. */
  readonly payers: readonly NextPayerCandidate[];
  /** The next distinct debt level. Empty when more than one payer is named. */
  readonly runnerUp: readonly NextPayerCandidate[];
  /** Does paying a typical round move *every* named payer toward zero? */
  readonly clearsGate: boolean;
}

/** Least recently paid first (never-paid first), then by id. Balances are equal here. */
function byRecencyThenId(a: NextPayerCandidate, b: NextPayerCandidate): number {
  if (a.lastPaidAt !== b.lastPaidAt) {
    // Never-paid sorts first. Compared explicitly: substituting -Infinity here
    // would make `null` vs `null` evaluate to NaN and destroy the ordering.
    if (a.lastPaidAt === null) return -1;
    if (b.lastPaidAt === null) return 1;
    return a.lastPaidAt - b.lastPaidAt;
  }
  return a.memberId < b.memberId ? -1 : 1;
}

/**
 * The members who should buy the group's next round, or `null` when nobody owes
 * anything — the group is settled and there is no one to name.
 */
export function rankNextRound(
  candidates: readonly NextPayerCandidate[],
  typicalExpenseMinorUnits: number,
): NextRoundRanking | null {
  const debtors = candidates.filter((c) => c.balanceMinorUnits < 0);
  if (debtors.length === 0) return null;

  // Total weight spans every candidate, not just the debtors: it is the group's
  // splitting denominator. Computed before any filtering.
  const totalWeight = candidates.reduce((sum, c) => sum + c.shareWeight, 0);
  const e = typicalExpenseMinorUnits;

  const deepest = debtors.reduce((m, c) => Math.min(m, c.balanceMinorUnits), Infinity);
  const payers = debtors.filter((c) => c.balanceMinorUnits === deepest).sort(byRecencyThenId);

  const shallower = debtors.filter((c) => c.balanceMinorUnits > deepest);
  const nextLevel = shallower.reduce((m, c) => Math.min(m, c.balanceMinorUnits), Infinity);
  const runnerUp =
    payers.length === 1 && shallower.length > 0
      ? shallower.filter((c) => c.balanceMinorUnits === nextLevel).sort(byRecencyThenId)
      : [];

  const clearsGate =
    e > 0 &&
    totalWeight > 0 &&
    payers.every(
      (c) => 2 * c.balanceMinorUnits * totalWeight + e * (totalWeight - c.shareWeight) <= 0,
    );

  return { payers, runnerUp, clearsGate };
}
