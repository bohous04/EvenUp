# Next Round — tied payers, and the gate as tone

**Date:** 2026-07-10
**Status:** approved
**Supersedes:** `2026-07-10-next-round-autopilot-design.md` §"The rule" (selection), §"Boundary behavior",
and the "When the card hides" table. Everything else in that spec stands.

## Problem

Two faults, found by looking at the shipped card.

**1. The gate vetoed the answer.** A member qualified only if paying a typical round moved them no
further from zero. When no debtor cleared that bar, the card hid itself. But the card's question is
not _"does paying help this person?"_ — it is _"someone is about to buy the next round; who should
it be?"_ The group is going to eat dinner regardless. Refusing to answer is not neutral; it abdicates.

**2. Ties were broken arbitrarily, in public.** When several members shared the deepest debt, the card
crowned one of them and demoted the rest to the runner-up line. The winner was chosen by
`lastPaidAt`, then by `memberId` — a database identifier. Two people with identical debt were treated
unequally for a reason no user could ever be told.

### Evidence that the veto was wrong

Simulated 200 000 random zero-sum groups (3–6 members, random `defaultShare` weights, random typical
expense). For each, every possible payer was evaluated:

| The deepest debtor is among the optimal payers for…              | share of cases |
| ---------------------------------------------------------------- | -------------- |
| **settlement count** (PRD G2 — the app's stated promise)         | **100.00%**    |
| balance spread (max − min)                                       | 93.31%         |
| balance spread, restricted to cases where nobody clears the gate | 74.89%         |

The deepest debtor is **never worse** on settlement count, which is the only objective EvenUp claims
to minimize. The earlier objection — _"paying moves Petr from −250 Kč to +350 Kč and widens the
spread"_ — was true, and measured the wrong thing: in that exact group every possible payer leaves
two settlements outstanding, so naming Petr costs nothing on the real metric.

The gate remains the only thing that knows whether a payment helps the person named. That information
is worth keeping. It is not worth silence.

## The rule

Selection ignores the gate.

```
payers     = every debtor whose balance equals the minimum balance
clearsGate = every payer satisfies  2·b·W + E·(W − w) ≤ 0
runnerUp   = the next distinct debt level, and only when exactly one payer is named
```

`payers` is ordered by least-recently-paid (never-paid first), then by `memberId` — the existing
comparator, whose balance branch simply never fires now that all payers are tied. The order decides
how names are listed, nothing more; no member is singled out by it.

### `clearsGate` is required of _all_ payers

The gate is evaluated per payer, not once for the group. Tied members can carry different
`defaultShare`, and the gate `b ≤ −E·(W − w) / 2W` is easier to clear with a larger share, so a tie
group can split: one member's payment moves them toward zero while another's does not.

The confident wording promises that paying evens up _whoever_ takes the round. It must therefore hold
for **every** name on the card. If any tied payer fails the gate, the card uses the soft wording.

When `W ≤ 0` or `E ≤ 0`, `clearsGate` is `false`: the gate is unknowable, so the card makes no promise.
It still names the deepest debtors.

## Copy

| State                | Czech                          | English                            |
| -------------------- | ------------------------------ | ---------------------------------- |
| confident, one payer | Rundu platí Jana               | Next one's on Jana                 |
| confident, tied      | Rundu platí Petr **nebo** Jana | Next one's on Petr **or** Jana     |
| soft, one payer      | Nejvíc pozadu: Jana            | Furthest behind: Jana              |
| soft, tied           | Nejvíc pozadu: Petr **a** Jana | Furthest behind: Petr **and** Jana |

The confident title is a **disjunction** — one of you pays. The soft title is a **conjunction** — a
statement of fact, carrying no instruction and no promise. `Intl.ListFormat` produces both correctly
in Czech and English, so nothing is hand-joined.

The reason line gains an "each" variant when more than one payer is named: _Skluz 250,00 Kč každý_ /
_Behind by 250,00 Kč each_.

### Overflow

At most three names are rendered. Beyond that: `Petr, Jana, Filip +2`, with the complete list in the
element's `title` attribute.

The truncated branch joins with a plain `', '` rather than `Intl.ListFormat`. This is deliberate and
was verified: Czech `Intl.ListFormat(type: 'unit')` renders `Petr, Jana a Filip`, inserting _"a"_
before the final visible name — which is a lie when the list continues. `narrow` style drops the
commas entirely (`Petr Jana Filip`). No `Intl` list type produces a correctly truncated list, so the
truncated case does not use one.

The `+2` chip is language-neutral on purpose. A word ("a 2 další" / "and 2 more") needs Czech plural
forms — _další_ for 2–4, _dalších_ for 5+ — which means `Intl.PluralRules` and a plural-aware `t()`.
`packages/i18n` has neither. Deferred, not forgotten (see Follow-ups).

## What collapses

The `hidden` shallow-debt state introduced earlier today disappears. With the gate no longer vetoing,
"debtors exist" always yields a suggestion, so an empty ranking means exactly "no debtors" — which is
what `square` always should have meant. The `anyDebtor` guard in `getNextRound` comes back out.

Concretely, the group that motivated this change — Olivia +500, Petr −250, Jana −250 — now renders
`Nejvíc pozadu: Petr a Jana / Skluz 250,00 Kč každý` instead of nothing.

## What does not change

The structural hides stay exactly as they are: archived group, fewer than two active members, fewer
than three `EXPENSE` transactions. `E` is still the lower median of the ten most recent expenses.
`lastPaidAt` is still sourced only from `EXPENSE` payers. No schema change, no migration.

## Architecture

### Core — `packages/core/src/balance/next-payer.ts`

`suggestNextPayer` is replaced by `rankNextRound`. Same purity contract: integer minor units, no
floats, deterministic, no I/O.

```ts
export interface NextPayerCandidate {
  readonly memberId: string;
  readonly balanceMinorUnits: number; // negative = owes
  readonly shareWeight: number; // Member.defaultShare
  readonly lastPaidAt: number | null; // epoch ms; null = never paid an EXPENSE
}

export interface NextRoundRanking {
  /** Every debtor tied at the deepest debt. Never empty. Never contains a creditor. */
  readonly payers: readonly NextPayerCandidate[];
  /** The next distinct debt level. Empty when `payers` holds more than one member. */
  readonly runnerUp: readonly NextPayerCandidate[];
  /** Does paying a typical round move *every* named payer toward zero? */
  readonly clearsGate: boolean;
}

/** Null when the group has no debtors. */
export function rankNextRound(
  candidates: readonly NextPayerCandidate[],
  typicalExpenseMinorUnits: number,
): NextRoundRanking | null;
```

Name formatting is **not** core's business — core returns member ids; the card formats.

### i18n — `packages/i18n/src/format.ts`

```ts
export function formatNameList(
  names: readonly string[],
  locale: Locale,
  type: 'conjunction' | 'disjunction',
  max = 3,
): string;
```

`names.length <= max` → `Intl.ListFormat(locale, { style: 'long', type })`.
Otherwise → `names.slice(0, max).join(', ') + ' +' + (names.length - max)`.

Exported through `packages/i18n/src/index.ts` and surfaced on `useI18n()` beside `formatCurrency`.

### Message keys

| Key                     | Placeholders          | CS                                              | EN                                                |
| ----------------------- | --------------------- | ----------------------------------------------- | ------------------------------------------------- |
| `nextRound.title`       | `{names}`             | Rundu platí {names}                             | Next one's on {names}                             |
| `nextRound.titleBehind` | `{names}`             | Nejvíc pozadu: {names}                          | Furthest behind: {names}                          |
| `nextRound.reason`      | `{amount}`            | Skluz {amount}                                  | Behind by {amount}                                |
| `nextRound.reasonEach`  | `{amount}`            | Skluz {amount} každý                            | Behind by {amount} each                           |
| `nextRound.runnerUp`    | `{names}`, `{amount}` | Pak {names} ({amount})                          | Then {names} ({amount})                           |
| `nextRound.square`      | —                     | Jste vyrovnaní — další rundu může vzít kdokoli. | You're all square — anyone can take the next one. |

`nextRound.title` and `nextRound.runnerUp` change their placeholder from `{name}` to `{names}`.
`titleBehind` and `reasonEach` are new. Every key takes the same placeholders in both languages.

### API — `packages/api/src/services/balance-service.ts`

```ts
export type NextRoundResult =
  | { readonly state: 'hidden' }
  | { readonly state: 'square' }
  | {
      readonly state: 'suggested';
      readonly typicalExpenseMinorUnits: number;
      readonly clearsGate: boolean;
      readonly payers: MemberBalance[];
      readonly runnerUp: MemberBalance[];
    };
```

`hidden` for archived / fewer than two active members / fewer than three expenses.
`square` when `rankNextRound` returns `null`.
`suggested` otherwise.

### Web — `apps/web/src/components/next-round-card.tsx`

Branches on `state`, then on `clearsGate` for the title and on `payers.length` for the reason line.
The runner-up line renders only when `runnerUp` is non-empty. Still no math in the card.

## Testing

**Core** (`next-payer.test.ts`, rewritten):

- One deepest debtor → `payers` length 1; `runnerUp` is the next distinct level.
- Two tied → `payers` length 2, ordered by `lastPaidAt` then `memberId`; `runnerUp` empty.
- Three members at three distinct debts → `runnerUp` holds only the second level, not the third.
- `clearsGate` true when every tied payer clears it; **false when one tied payer with a smaller
  `shareWeight` fails it while the other passes** — the all-not-any rule.
- `clearsGate` false when `E ≤ 0` or `W ≤ 0`, while `payers` is still populated.
- No debtors → `null`.
- A creditor is never in `payers`, even when it is the only member left.

**Property** (fast-check, as before): every member of `payers` has the minimum balance among
candidates; no member of `payers` has `balance ≥ 0`; the result is invariant under permutation of the
input.

**i18n**: existing catalog-parity and non-empty tests cover the new keys. Add a unit test for
`formatNameList`: two names, three names, four names (overflow), in both locales — asserting
`Petr nebo Jana`, `Petr, Jana nebo Filip`, and `Petr, Jana, Filip +1`.

**API** (`next-round.test.ts`): the shallow-debt fixture (Olivia +500, Petr −250, Jana −250) flips
from asserting `{ state: 'hidden' }` to asserting `state: 'suggested'`, `clearsGate: false`,
`payers` = [Petr, Jana], `runnerUp` empty. The truly-settled, archived, solo-group, young-group, and
median-window tests are unchanged.

**E2E**: the existing spec's group still names one payer with a runner-up. Add an assertion that a
tied group renders both names and no runner-up line.

## Follow-ups (not this change)

- Plural-aware overflow (`a 2 další` / `dalších`), requiring `Intl.PluralRules` and a plural-aware `t()`.
- Showing the card before the third expense, using the soft wording, since `clearsGate` already
  handles an unknown `E`.
