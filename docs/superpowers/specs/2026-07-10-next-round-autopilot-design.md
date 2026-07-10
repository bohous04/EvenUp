# Next Round — design

**Date:** 2026-07-10
**Status:** approved, partly superseded
**Requirements:** PRD §1.2 (vision: minimize debts), FR-6.1 (net balances), FR-6.5 (visualize debts),
§5 (debt minimization), §14 (success metric: % of group debts that get marked settled)

> **Partly superseded by [`2026-07-10-next-round-tied-payers-design.md`](./2026-07-10-next-round-tied-payers-design.md).**
> The gate no longer decides _whether_ the card speaks, only _how_ it words itself, and every member
> tied at the deepest debt is named rather than one being crowned. The sections marked **superseded**
> below describe the original behavior. The gate's derivation, its numeric-safety analysis, `E`, and
> the structural hides are all unchanged and still authoritative.

## Problem

EvenUp minimizes the number of settlement payments _after_ the spending is done. So does every
competitor: Splitwise and Settle Up both treat settlement as a post-hoc chore, hand you a list of
payments at the end of the trip, and optimize how short that list is.

Nobody optimizes so that the list is short **because there was less to clean up**. The group has all
the information needed — balances are recomputed on every transaction (FR-6.4) — but that
information is only ever used to describe the past. Nothing on any screen tells the group what to do
next, and the app's central promise ("EvenUp") is never acted on while there is still time to act on
it.

Concretely: on a week-long trip Olivia pays for everything because she is the organizer, and the
group ends with three settlement payments that four people have to remember to make. If the app had
said "Filip, get this one" on day three, there would be zero.

## Scope

**In scope:** a read-only card on the group screen naming who should pay the group's next shared
expense, a pure ranking function in `packages/core`, one tRPC query, CZ/EN strings, tests.

**Out of scope:** notifications, pre-filling the expense form, mobile, any change to how expenses are
recorded, any schema change, any promise about the amount of the next expense.

### Why the group screen and not the expense form

Inside the expense form the amount is known, so the app could solve the true problem: _which payer
minimizes the settlements remaining afterward?_ That is strictly better math. It is also strictly too
late — by the time you are filling in the form, somebody has already paid. The card has to appear
before the money moves, which means it must work from balances alone and must accept that it is
ranking, not optimizing.

### Why no forecast on the card

Earlier drafts printed the projected outcome ("leaves the group ±120 Kč"). That number is a
projection about an expense that has not happened, at a size guessed from history. The first time a
user sees it visibly contradicted, the card loses the credibility it needs to change anyone's
behavior. The card states a **reason** ("behind by 1 450 Kč"), which is a fact, and never a
forecast.

## Architecture

### Dependency direction

```
packages/core/src/balance/next-payer.ts     pure, integer-only, no I/O
        ↑
packages/api/src/services/balance-service.ts    loads balances, weights, lastPaidAt, median E
        ↑
packages/api/src/routers/balance.ts             balance.nextPayer query
        ↑
apps/web  NextRoundCard                          renders; no math
```

Nothing new flows downward. `next-payer.ts` sits beside `balance.ts` because it is a derivative of
net balances, and it inherits that module's constraints: pure, deterministic, integer minor units, no
floats in any money path.

### The rule

Only members who **owe** are considered: `b < 0`. A creditor is never asked to buy a round, and
stating that as a precondition rather than hoping the arithmetic implies it is what makes the rest of
this section exact.

Among those, a member **qualifies** if paying a typical round leaves them no further from zero than
they are now. Let `b` be the member's net balance in base-currency minor units (negative = owes), `E`
the typical expense total in the same units, `w` the member's `defaultShare`, and `W` the sum of
`defaultShare` across active members. Paying `E` while consuming a `w/W` share of it raises the
member's balance by `E·(1 − w/W)`. The qualifying condition is:

```
|b + E·(1 − w/W)|  ≤  |b|
```

Because `b < 0` and the increase is non-negative, this reduces to `2b + E·(1 − w/W) ≤ 0`, and
multiplying through by `W > 0` clears the fraction, leaving a comparison in integers only:

```
2·b·W  +  E·(W − w)  ≤  0
```

The two forms are equivalent for every `b < 0` and `W ≥ 1`, including the degenerate `w = W` where
paying moves the balance by exactly zero. Verified against the fractional definition over one million
random `(b, E, W, w)` and by exhaustive sweep of a small domain in exact integer arithmetic: zero
divergences.

There is no tuning constant. The gate is the algebraic statement of "don't make it worse," and it is
the part of this feature that a competitor's afternoon-project version does not have: it is what
refuses to send a member 1 450 Kč in debt to pay for a 4 000 Kč cabin and land them 1 150 Kč in
credit.

> **Superseded.** Selection no longer consults the gate, and tied members are named together rather
> than one being crowned. See the tied-payers spec. The derivation above still stands — the gate now
> decides the card's _wording_, not its _silence_.

Among qualifying members, the card names the one **furthest in debt** (most negative `b`). Exact ties
break by **least recently paid**, then by `memberId` — the same stable-by-id convention as
`byAmountDescThenId` in `balance.ts`.

The tiebreak carries real weight. After three equal expenses all paid by Olivia, Petr and Filip sit
at exactly −1 800 Kč each; ties are the ordinary case in the early life of a group, which is when the
card has the most influence over the outcome. `lastPaidAt` is the most recent `Transaction.date` on
which the member appears in `TransactionPayer` for a transaction of type `EXPENSE`. Settlements
(`TRANSFER`) do not count as taking a turn — repaying a debt is not buying a round. Members who have
never paid sort first.

### Degenerate inputs

`suggestNextPayer` returns an empty ranking when `W ≤ 0` or `E ≤ 0`. Neither is reachable through the
API — `defaultShare` is validated `int().min(1).max(1000)` in `packages/api/src/schemas.ts`, and the
card needs three expenses before it renders — but `packages/core` is consumed by web, mobile, and the
API alike and cannot depend on a validator that sits above it. The guard is not defensive padding: at
`W = 0` the gate collapses to `0 ≤ 0` and admits every debtor regardless of `E`.

### Boundary behavior

The gate is inclusive (`≤`). A member sitting exactly on it — owing precisely `E·(W − w) / 2W`, which
for an equal three-way split of 1 800 Kč means owing 600 Kč — is mirrored to the opposite balance of
equal magnitude. Paying does not improve their distance from zero, but it does not worsen it either,
and it can still cut the settlement count by clearing a creditor.

Inclusivity is therefore the deliberate choice: the boundary member is the shallowest debtor who can
absorb a typical round without overshooting, and excluding them would reject the exact break-even
case for no reason beyond a strict inequality. The unit tests pin both sides of it — −60 000
qualifies, −59 999 does not.

### Numeric safety

`2·b·W + E·(W − w)` stays exact in IEEE-754 doubles for any realistic group. `defaultShare` is capped
at 1 000, so `W` is bounded by 10^5 even for an implausible hundred-member group; with `|b|` and `E`
bounded by 10^9 minor units (10 000 000 Kč), the expression is bounded by about 3·10^14, comfortably
inside the 2^53 ≈ 9·10^15 safe-integer range. No `BigInt` is needed inside the pure function;
`toMinor` already narrows Prisma's `BigInt` at the service boundary, as it does for balances today.

### `E` — the typical expense

The median `baseMinorUnits` of the group's ten most recent `EXPENSE` transactions, ordered by `date`
descending. Median rather than mean, so one 40 000 Kč cabin does not drag the gate up and disqualify
everyone.

`INCOME` and `TRANSFER` are excluded: neither is a round somebody buys. Recurring templates are
included, because `loadBalanceTransactions` already counts them toward balances and the two views
must not disagree.

Below three expenses the card does not render at all. A group that new has balances near zero and
nothing useful to say, and a median over one or two samples is not a typical anything.

## Data flow

```
balance.nextPayer({ groupId })
  → assertGroupAccess
  → getGroupBalances(groupId)             existing; balances in base minor units
  → prisma.transaction.findMany           where { groupId, type: EXPENSE }
                                          select { date, baseMinorUnits, payers: { memberId } }
                                          orderBy date desc
       ├→ first 10 → median(baseMinorUnits) = E
       └→ all rows → lastPaidAt per memberId (first row a member appears in)
  → suggestNextPayer(candidates, E)       pure
  → ranked candidates mapped back to MemberBalance by memberId
  → { typicalExpenseMinorUnits, ranked: MemberBalance[] }
```

One `findMany` serves both derived values. `lastPaidAt` cannot be a `groupBy` aggregate: Prisma's
`groupBy` only aggregates scalar columns of the model being grouped, and `TransactionPayer` holds no
date — the date lives on `Transaction`. Since the rows are already ordered by `date` descending, the
first row in which a member appears as a payer _is_ their `lastPaidAt`, so a single pass computes it
with no extra query.

`candidates` covers **active members only** (`isActive: true`). `getGroupBalances` returns every
member including deactivated ones at a default balance of 0; a deactivated member must never be told
to buy a round.

The pure function takes and returns candidates, which carry no display data. The service re-attaches
`displayName`, `initials`, and `color` by joining the ranked `memberId`s back against the
`MemberBalance[]` it already holds, so the card's rows are shaped exactly like the balance rows
beneath them.

### Core signature

```ts
export interface NextPayerCandidate {
  readonly memberId: string;
  readonly balanceMinorUnits: number; // negative = owes
  readonly shareWeight: number; // Member.defaultShare, ≥ 1
  readonly lastPaidAt: number | null; // epoch ms; null = never paid a round
}

/**
 * Debtors for whom paying a typical round of `typicalExpenseMinorUnits` moves them no
 * further from zero, ranked most-in-debt first. Ties break by least recently paid,
 * then by memberId. Creditors and square members are never returned. Empty when the
 * group is settled, when no weight is assigned, or when the typical expense is unknown.
 */
export function suggestNextPayer(
  candidates: readonly NextPayerCandidate[],
  typicalExpenseMinorUnits: number,
): readonly NextPayerCandidate[];
```

## UI surface

A card above the balances list on `apps/web/src/app/groups/[id]/page.tsx`.

```
┌────────────────────────────────┐
│ ✦ Next one's on Filip          │
│   Behind by 1 450 Kč           │
│                                │
│   Then Petr (−890 Kč)          │
└────────────────────────────────┘
```

The runner-up line is what makes the card work socially. If Filip will not pay, the table can already
see it is Petr — no dismiss button, no snooze, no per-device state, no schema. The card is a pure
function of data the group screen already fetches.

The leading mark is an **icon component**, not an emoji glyph.

Amounts and the member's initials/color chip reuse the existing balance-row formatting, so the card
reads as part of the balances block rather than an advertisement above it.

### When the card hides

> **Superseded.** The last two rows no longer hold. Debtors who clear no gate are now named with the
> soft wording instead of hiding the card, and tied payers suppress the runner-up line. See the
> tied-payers spec for the current table. The three structural hides are unchanged.

| Condition                                | Behavior                                            |
| ---------------------------------------- | --------------------------------------------------- |
| Fewer than 3 `EXPENSE` transactions      | Card absent                                         |
| Group archived (`archivedAt` set)        | Card absent                                         |
| Fewer than 2 active members              | Card absent                                         |
| Nobody owes anything (group settled)     | "You're all square — anyone can take the next one." |
| Debtors exist but nobody clears the gate | Card absent                                         |
| Exactly one qualifies                    | Card renders without the runner-up line             |

The card renders regardless of the group's `simplifyDebts` setting. Net balances exist either way;
only the _settlement_ view depends on that toggle.

## Error handling

The query is a read over data the group screen already loads. It cannot fail in a way `balance.get`
would not already fail, and it is authorized by the same `assertGroupAccess`. If it errors, the card
does not render and the balances below it are unaffected — the card is never load-bearing for
settling up, which remains reachable through the existing settlements UI.

## i18n

Czech is the default (FR-10.1). Strings live in `packages/i18n`; no user-facing text is hard-coded
(FR-10.4). Amounts format per locale (FR-10.3).

| Key                  | Placeholders         | CS                                              | EN                                                |
| -------------------- | -------------------- | ----------------------------------------------- | ------------------------------------------------- |
| `nextRound.title`    | `{name}`             | Rundu platí {name}                              | Next one's on {name}                              |
| `nextRound.reason`   | `{amount}`           | Skluz {amount}                                  | Behind by {amount}                                |
| `nextRound.runnerUp` | `{name}`, `{amount}` | Pak {name} ({amount})                           | Then {name} ({amount})                            |
| `nextRound.square`   | —                    | Jste vyrovnaní — další rundu může vzít kdokoli. | You're all square — anyone can take the next one. |

Each key takes the same placeholders in both languages, so the catalogs stay mechanically checkable.

`nextRound.reason` carries no pronoun and no name. The name is already in the title directly above
it, and a pronoun would force the string to know the member's gender — which EvenUp does not store,
and which Czech would need in order to inflect. "Skluz 1 450 Kč" and "Behind by 1 450 Kč" work for
anyone.

The Czech title deliberately drops the pronoun: "Rundu platí Filip" is how the sentence is actually
said out loud.

## Testing

**Unit** (`packages/core/src/balance/next-payer.test.ts`):

- The gate at its exact boundary: with `E` = 180 000 and an equal three-way split, `b` = −60 000
  qualifies and `b` = −59 999 does not.
- No member with `b ≥ 0` is ever returned, creditor or square.
- Unequal `shareWeight` shifts the gate: with `E` = 180 000 and `W` = 4, a member with
  `defaultShare` 2 qualifies from −45 000, one with `defaultShare` 1 only from −67 500 — a larger
  share means less of the payment lands on your own balance, so you need less debt to absorb it.
- `W ≤ 0` and `E ≤ 0` each return an empty ranking.
- Exact balance ties order by `lastPaidAt` ascending, `null` first, then by `memberId`.
- Empty result when every member is square.

**Property** (mirroring the existing `balance.test.ts` suite): for any random balance set, any
positive `E`, and any positive weights — no returned member has `b ≥ 0`; every returned member's
projected `|b + E(1 − w/W)|` is `≤` their current `|b|`; the result is sorted; and the function is
deterministic under permutation of its input.

The property test is the one that matters. It is the executable form of the gate's derivation, and
it is what will catch a future refactor that reintroduces a float into the comparison.

**Integration** (`packages/api`): a seeded group of three where Olivia pays three equal expenses;
assert `balance.nextPayer` ranks the two debtors, breaks their exact tie by `memberId`, and returns
`E` equal to the expense total. A second case asserts deactivated members never appear.

**E2E** (Playwright): the card appears on the group page naming the expected member, and is absent
for a two-expense group.

## Follow-ups (not this spec)

- The same core function, surfaced inside the expense form as a payer default once the amount is
  known — where the true optimization is available.
- A mobile card in `apps/mobile`, once the web card is proven.
- A notification nudge riding the existing spine. Deliberately deferred: an app that tells you
  unprompted to pay for things is easy to hate, and the card should earn its trust silently first.
