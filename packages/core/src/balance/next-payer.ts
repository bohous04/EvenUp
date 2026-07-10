/**
 * Who should pay for the group's next shared expense (PRD §1.2, FR-6.1).
 *
 * Pure, deterministic, integer minor units — the same contract as `balance.ts`,
 * of which this is a derivative.
 *
 * A member **qualifies** if paying a typical round leaves them no further from
 * zero than they are now. With balance `b < 0`, typical expense `E`, own weight
 * `w` and total weight `W`, paying raises their balance by `E·(1 − w/W)`, so the
 * condition `|b + E·(1 − w/W)| ≤ |b|` reduces to `2b + E·(1 − w/W) ≤ 0`, and
 * multiplying by `W > 0` clears the fraction:
 *
 *     2·b·W + E·(W − w) ≤ 0
 *
 * No tuning constant: it is the algebraic statement of "don't make it worse".
 * Only debtors are considered, which is what makes that reduction exact for
 * every `W ≥ 1` — including the degenerate `w = W`, where paying changes nothing.
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

/** Deepest debt first; exact ties by least recently paid (never-paid first), then by id. */
function byDebtThenRecencyThenId(a: NextPayerCandidate, b: NextPayerCandidate): number {
  if (a.balanceMinorUnits !== b.balanceMinorUnits) {
    return a.balanceMinorUnits - b.balanceMinorUnits;
  }
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
 * Debtors for whom paying a typical round of `typicalExpenseMinorUnits` moves them
 * no further from zero, ranked most-in-debt first. Creditors and square members are
 * never returned. Empty when the group is settled, when no weight is assigned, or
 * when the typical expense is unknown.
 */
export function suggestNextPayer(
  candidates: readonly NextPayerCandidate[],
  typicalExpenseMinorUnits: number,
): readonly NextPayerCandidate[] {
  const e = typicalExpenseMinorUnits;
  if (e <= 0) return [];

  // Total weight spans every candidate, not just the debtors: it is the group's
  // splitting denominator. Computed before any filtering.
  const totalWeight = candidates.reduce((sum, c) => sum + c.shareWeight, 0);
  if (totalWeight <= 0) return [];

  return candidates
    .filter(
      (c) =>
        c.balanceMinorUnits < 0 &&
        2 * c.balanceMinorUnits * totalWeight + e * (totalWeight - c.shareWeight) <= 0,
    )
    .sort(byDebtThenRecencyThenId);
}
