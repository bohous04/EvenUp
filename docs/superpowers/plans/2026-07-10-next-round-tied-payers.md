# Next Round — Tied Payers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Next Round card names every member tied at the deepest debt, and the gate stops deciding whether the card speaks — it only decides how the card words itself.

**Architecture:** `packages/core` replaces `suggestNextPayer` with `rankNextRound`, which returns the tied deepest debtors, the next distinct debt level, and a `clearsGate` flag. `packages/api` reshapes its query payload to match. `packages/i18n` gains a locale-aware name-list formatter and two message keys. `apps/web` renders a name list and picks between confident and soft wording. No schema change, no migration.

**Tech Stack:** TypeScript, pnpm + Turborepo monorepo, Vitest + fast-check, Prisma + PostgreSQL, tRPC, Next.js App Router, Tailwind, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-10-next-round-tied-payers-design.md`

## Global Constraints

- **Integer minor units only.** No floats in any money path. `packages/core` is pure, deterministic, side-effect free.
- **Selection ignores the gate.** `payers` = every debtor whose balance equals the minimum balance.
- **`clearsGate` is required of _all_ payers.** Tied members can hold different `shareWeight`, and the gate is easier to clear with a larger share. The confident wording promises paying evens up _whoever_ takes the round, so it must hold for every name shown. `clearsGate` is `false` when `W ≤ 0` or `E ≤ 0`.
- **The gate itself is unchanged:** `2·b·W + E·(W − w) ≤ 0`, evaluated only for `b < 0`. No tuning constants.
- **`runnerUp` is shown only when exactly one payer is named.**
- **At most three names are rendered**, then a `+N` chip. The truncated branch joins with a plain `', '`, never `Intl.ListFormat` — Czech `type: 'unit'` renders `Petr, Jana a Filip`, inserting "a" before the last visible name, which is wrong when the list continues.
- **Czech is the source-of-truth catalog.** `en.ts` is typed `Messages`, so a key in one and not the other is a **compile error**. Each key takes the same placeholders in both languages.
- **All user-facing strings come from the catalog.** No hard-coded text. Icons are SVG components, never emoji; `apps/web/src/components/icons.tsx` is the only permitted `lucide-react` import site.
- **No Prisma migration.** No schema change.
- **Commit messages:** conventional commits. Do **not** add a `Co-Authored-By` trailer.
- **Prettier is a CI gate.** `pnpm format:check` runs in CI alongside ESLint. Run `pnpm format` before your final commit or CI fails.

---

## File Structure

| File                                           | Responsibility                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `packages/i18n/src/format.ts`                  | **Modify.** Add `formatNameList`.                                  |
| `packages/i18n/src/index.ts`                   | **Modify.** Export it.                                             |
| `packages/i18n/src/locales/cs.ts`              | **Modify.** Two new keys; two placeholder renames.                 |
| `packages/i18n/src/locales/en.ts`              | **Modify.** The same.                                              |
| `packages/i18n/src/i18n.test.ts`               | **Modify.** Tests for `formatNameList`.                            |
| `packages/core/src/balance/next-payer.ts`      | **Rewrite.** `suggestNextPayer` → `rankNextRound`.                 |
| `packages/core/src/balance/next-payer.test.ts` | **Rewrite.** New shape, new properties.                            |
| `packages/core/src/index.ts:64`                | **Modify.** Re-export `rankNextRound` + `NextRoundRanking`.        |
| `packages/api/src/services/balance-service.ts` | **Modify.** New `NextRoundResult`; drop the `anyDebtor` guard.     |
| `packages/api/src/routers/next-round.test.ts`  | **Modify.** Two tests change meaning; the rest change field names. |
| `apps/web/src/lib/i18n.tsx`                    | **Modify.** Surface `formatNameList` on `useI18n()`.               |
| `apps/web/src/components/next-round-card.tsx`  | **Rewrite.** Render a name list; branch on `clearsGate`.           |
| `apps/web/e2e/next-round.spec.ts`              | **Modify.** Add a tied-payers case.                                |

### Cross-package breakage is expected mid-plan

Each task verifies **its own package**. Between tasks, a _different_ package will not typecheck, and that is normal:

| After task | Expected red                                                   |
| ---------- | -------------------------------------------------------------- |
| Task 2     | `@evenup/api` typecheck (`suggestNextPayer` no longer exists)  |
| Task 3     | `@evenup/web` typecheck (`ranked` no longer exists on payload) |
| Task 4     | nothing — Final Verification runs the whole workspace          |

Do **not** run root `pnpm typecheck` / `pnpm test` until Task 4. Run the per-package commands each task gives you.

---

### Task 1: Name-list formatter and message keys

**Files:**

- Modify: `packages/i18n/src/format.ts`
- Modify: `packages/i18n/src/index.ts`
- Modify: `packages/i18n/src/locales/cs.ts`
- Modify: `packages/i18n/src/locales/en.ts`
- Test: `packages/i18n/src/i18n.test.ts`

**Interfaces:**

- Consumes: `Locale`, `INTL_LOCALE` (module-private in `format.ts`).
- Produces:
  - `function formatNameList(names: readonly string[], locale: Locale, type: 'conjunction' | 'disjunction', max?: number): string`
  - Message keys `nextRound.title` `{names}`, `nextRound.titleBehind` `{names}`, `nextRound.reason` `{amount}`, `nextRound.reasonEach` `{amount}`, `nextRound.runnerUp` `{names}` `{amount}`.

- [ ] **Step 1: Write the failing test**

Append to `packages/i18n/src/i18n.test.ts`. The file imports its helpers from `./index.js`, so add `formatNameList` to that existing import list:

```ts
import {
  t,
  createTranslator,
  formatCurrency,
  formatNumber,
  formatDate,
  formatNameList,
  catalogs,
  LOCALES,
  DEFAULT_LOCALE,
} from './index.js';
```

This means Step 4 (the barrel export) must land before the test can even resolve — run the test anyway in Step 2 and confirm it fails on the unresolved export. That is the red step.

```ts
describe('formatNameList', () => {
  test('joins two names as a disjunction (one of you pays)', () => {
    expect(formatNameList(['Petr', 'Jana'], 'cs', 'disjunction')).toBe('Petr nebo Jana');
    expect(formatNameList(['Petr', 'Jana'], 'en', 'disjunction')).toBe('Petr or Jana');
  });

  test('joins two names as a conjunction (a statement of fact)', () => {
    expect(formatNameList(['Petr', 'Jana'], 'cs', 'conjunction')).toBe('Petr a Jana');
    expect(formatNameList(['Petr', 'Jana'], 'en', 'conjunction')).toBe('Petr and Jana');
  });

  test('joins three names', () => {
    expect(formatNameList(['Petr', 'Jana', 'Filip'], 'cs', 'disjunction')).toBe(
      'Petr, Jana nebo Filip',
    );
    expect(formatNameList(['Petr', 'Jana', 'Filip'], 'en', 'disjunction')).toBe(
      'Petr, Jana, or Filip',
    );
  });

  test('truncates beyond three names and appends a +N chip', () => {
    expect(formatNameList(['Petr', 'Jana', 'Filip', 'Zoe'], 'cs', 'disjunction')).toBe(
      'Petr, Jana, Filip +1',
    );
    expect(formatNameList(['Petr', 'Jana', 'Filip', 'Zoe', 'Adam'], 'en', 'conjunction')).toBe(
      'Petr, Jana, Filip +2',
    );
  });

  test('the truncated branch never inserts a conjunction word', () => {
    // Czech Intl.ListFormat(type:'unit') would render "Petr, Jana a Filip" — a lie
    // when the list continues. The truncated branch must join with a plain comma.
    expect(formatNameList(['Petr', 'Jana', 'Filip', 'Zoe'], 'cs', 'conjunction')).not.toContain(
      ' a Filip',
    );
  });

  test('a single name is returned as-is', () => {
    expect(formatNameList(['Jana'], 'cs', 'disjunction')).toBe('Jana');
    expect(formatNameList(['Jana'], 'en', 'conjunction')).toBe('Jana');
  });

  test('respects a custom max', () => {
    expect(formatNameList(['Petr', 'Jana', 'Filip'], 'en', 'conjunction', 2)).toBe('Petr, Jana +1');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @evenup/i18n exec vitest run src/i18n.test.ts
```

Expected: FAIL — `formatNameList is not a function` (or an unresolved import).

- [ ] **Step 3: Implement the formatter**

Append to `packages/i18n/src/format.ts`:

```ts
/**
 * Join display names for a sentence. Up to `max` names are joined with
 * `Intl.ListFormat`; beyond that the list is truncated and the remainder is shown
 * as a `+N` chip.
 *
 * `disjunction` ("Petr nebo Jana") is an instruction — one of you pays.
 * `conjunction` ("Petr a Jana") is a statement of fact.
 *
 * The truncated branch joins with a plain `', '` on purpose. Czech
 * `Intl.ListFormat(type: 'unit')` renders `Petr, Jana a Filip`, inserting "a"
 * before the last visible name — which is wrong when the list continues — and
 * `style: 'narrow'` drops the commas entirely. No `Intl` list type produces a
 * correctly truncated list.
 */
export function formatNameList(
  names: readonly string[],
  locale: Locale,
  type: 'conjunction' | 'disjunction',
  max = 3,
): string {
  if (names.length <= max) {
    return new Intl.ListFormat(INTL_LOCALE[locale], { style: 'long', type }).format(names);
  }
  return `${names.slice(0, max).join(', ')} +${names.length - max}`;
}
```

- [ ] **Step 4: Export it**

In `packages/i18n/src/index.ts`, change the `./format.js` export line to:

```ts
export { formatCurrency, formatNumber, formatDate, formatNameList, type Locale } from './format.js';
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter @evenup/i18n exec vitest run src/i18n.test.ts
```

Expected: PASS.

- [ ] **Step 6: Add the Czech keys**

In `packages/i18n/src/locales/cs.ts`, replace the existing `nextRound.*` block with:

```ts
  'nextRound.title': 'Rundu platí {names}',
  'nextRound.titleBehind': 'Nejvíc pozadu: {names}',
  'nextRound.reason': 'Skluz {amount}',
  'nextRound.reasonEach': 'Skluz {amount} každý',
  'nextRound.runnerUp': 'Pak {names} ({amount})',
  'nextRound.square': 'Jste vyrovnaní — další rundu může vzít kdokoli.',
```

- [ ] **Step 7: Run typecheck to verify it fails**

```bash
pnpm --filter @evenup/i18n typecheck
```

Expected: FAIL — `en` is typed `Messages` and is now missing `nextRound.titleBehind` and `nextRound.reasonEach`.

- [ ] **Step 8: Add the English keys**

In `packages/i18n/src/locales/en.ts`, replace the existing `nextRound.*` block with:

```ts
  'nextRound.title': "Next one's on {names}",
  'nextRound.titleBehind': 'Furthest behind: {names}',
  'nextRound.reason': 'Behind by {amount}',
  'nextRound.reasonEach': 'Behind by {amount} each',
  'nextRound.runnerUp': 'Then {names} ({amount})',
  'nextRound.square': "You're all square — anyone can take the next one.",
```

- [ ] **Step 9: Verify typecheck and the whole i18n suite pass**

```bash
pnpm --filter @evenup/i18n typecheck && pnpm --filter @evenup/i18n test
```

Expected: PASS, including the pre-existing "every locale defines exactly the same keys as Czech" and "no message is left empty" tests.

- [ ] **Step 10: Commit**

```bash
git add packages/i18n
git commit -m "i18n: name-list formatter and tied-payer strings"
```

---

### Task 2: `rankNextRound` in core

**Files:**

- Rewrite: `packages/core/src/balance/next-payer.ts`
- Rewrite: `packages/core/src/balance/next-payer.test.ts`
- Modify: `packages/core/src/index.ts:64`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `interface NextPayerCandidate { readonly memberId: string; readonly balanceMinorUnits: number; readonly shareWeight: number; readonly lastPaidAt: number | null }` (unchanged)
  - `interface NextRoundRanking { readonly payers: readonly NextPayerCandidate[]; readonly runnerUp: readonly NextPayerCandidate[]; readonly clearsGate: boolean }`
  - `function rankNextRound(candidates: readonly NextPayerCandidate[], typicalExpenseMinorUnits: number): NextRoundRanking | null`

`suggestNextPayer` is **deleted**. After this task `@evenup/api` will not typecheck — that is expected and Task 3 fixes it. Verify with core-scoped commands only.

**Watch out:** two traps.

1. The comparator must not substitute `-Infinity` for a `null` `lastPaidAt` and subtract — two never-paid members would compare `-Infinity - -Infinity = NaN`, and a comparator returning `NaN` yields an unspecified order.
2. Total weight is summed over **all** candidates, before any filtering. It is the group's splitting denominator, not the debtors' weight.

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `packages/core/src/balance/next-payer.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @evenup/core exec vitest run src/balance/next-payer.test.ts
```

Expected: FAIL — `rankNextRound` is not exported from `./next-payer.js`.

- [ ] **Step 3: Rewrite the implementation**

Replace the entire contents of `packages/core/src/balance/next-payer.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @evenup/core exec vitest run src/balance/next-payer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Update the barrel export**

In `packages/core/src/index.ts`, replace line 64:

```ts
export {
  rankNextRound,
  type NextPayerCandidate,
  type NextRoundRanking,
} from './balance/next-payer.js';
```

- [ ] **Step 6: Verify core typechecks and its whole suite passes**

```bash
pnpm --filter @evenup/core typecheck && pnpm --filter @evenup/core test
```

Expected: PASS — including the pre-existing `balance.test.ts`. Do **not** run root `pnpm typecheck`; `@evenup/api` is expected to be red until Task 3.

- [ ] **Step 7: Commit**

```bash
git add packages/core
git commit -m "feat(core): rankNextRound — name every debtor tied at the deepest debt"
```

---

### Task 3: Reshape the API payload

**Files:**

- Modify: `packages/api/src/services/balance-service.ts`
- Test: `packages/api/src/routers/next-round.test.ts`

**Interfaces:**

- Consumes: `rankNextRound`, `NextPayerCandidate` from `@evenup/core` (Task 2).
- Produces:

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

`balance.nextPayer`'s router entry does not change. After this task `@evenup/web` will not typecheck — expected; Task 4 fixes it.

**Requires a database.** The harness reads `process.env.DATABASE_URL`. If the container is down:
`docker run -d --name evenup-e2e-db -e POSTGRES_USER=evenup -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=evenup -p 55433:5432 postgres:16`
then `DATABASE_URL=postgresql://evenup:pass@localhost:55433/evenup pnpm --filter @evenup/db exec prisma migrate deploy`.

- [ ] **Step 1: Rewrite the two tests whose meaning changes**

In `packages/api/src/routers/next-round.test.ts`:

**(a)** Update the file's header comment — its last line currently reads `ranked = [Jana, Petr]`. Replace that line with:

```
 *   payers = [Jana], runnerUp = [Petr], clearsGate = true
```

**(b)** Replace the test named `'ranks the qualifying debtors deepest-first and reports the median expense'` with:

```ts
test('names the deepest debtor, with the next level as runner-up', async () => {
  const { caller, group, members, expense } = await seedGroup();
  await expense('Chata', members.olivia.id, 90_000, '2026-06-20');
  await expense('Vlek', members.olivia.id, 90_000, '2026-06-21');
  await expense('Kava', members.petr.id, 30_000, '2026-06-22');

  const result = await caller.balance.nextPayer({ groupId: group.id });
  expect(result.state).toBe('suggested');
  if (result.state !== 'suggested') throw new Error('unreachable');

  expect(result.typicalExpenseMinorUnits).toBe(90_000);
  expect(result.clearsGate).toBe(true);
  expect(result.payers.map((m) => m.displayName)).toEqual(['Jana Dvořáková']);
  expect(result.payers[0]!.balanceMinorUnits).toBe(-70_000);
  expect(result.payers[0]!.color).toMatch(/^#[0-9a-f]{6}$/);
  expect(result.runnerUp.map((m) => m.displayName)).toEqual(['Petr Svoboda']);
  expect(result.runnerUp[0]!.balanceMinorUnits).toBe(-40_000);
});
```

**(c)** Replace the test named `'hides itself when debts exist but nobody clears the gate'` with the following. Note it asserts the payer names as a **sorted set**, not in order: both members have never paid an `EXPENSE` (settlements are `TRANSFER`s), so their `lastPaidAt` is `null` and the order falls back to `memberId`, which is a cuid the test must not depend on.

```ts
test('names the tied debtors without claiming it evens them up', async () => {
  const { caller, group, members, expense } = await seedGroup();
  // Three equal rounds, all paid by Olivia: E = 90_000, W = 3, w = 1, so the gate
  // is b <= -30_000. Before settling: Olivia +180_000, Petr -90_000, Jana -90_000.
  await expense('Chata', members.olivia.id, 90_000, '2026-06-20');
  await expense('Vlek', members.olivia.id, 90_000, '2026-06-21');
  await expense('Kava', members.olivia.id, 90_000, '2026-06-22');

  // Partial settlements are TRANSFERs, not EXPENSEs: they move balances without
  // touching the median or lastPaidAt.
  for (const from of [members.petr, members.jana]) {
    await caller.transaction.recordTransfer({
      groupId: group.id,
      fromMemberId: from.id,
      toMemberId: members.olivia.id,
      amountMinorUnits: 65_000,
      currency: 'CZK',
    });
  }

  // Final: Olivia +50_000, Petr -25_000, Jana -25_000 (sums to zero). Both debtors
  // are shallower than the -30_000 gate, so the card names them but makes no promise.
  const result = await caller.balance.nextPayer({ groupId: group.id });
  expect(result.state).toBe('suggested');
  if (result.state !== 'suggested') throw new Error('unreachable');

  expect(result.clearsGate).toBe(false);
  expect(result.payers.map((m) => m.displayName).sort()).toEqual([
    'Jana Dvořáková',
    'Petr Svoboda',
  ]);
  expect(result.payers.every((m) => m.balanceMinorUnits === -25_000)).toBe(true);
  expect(result.runnerUp).toEqual([]);
});
```

**(d)** In the test named `'never names a deactivated member'`, replace its final assertion line with:

```ts
expect(result.payers.map((m) => m.memberId)).not.toContain(members.jana.id);
expect(result.runnerUp.map((m) => m.memberId)).not.toContain(members.jana.id);
```

Leave `'hides itself below three expenses'`, `'reports a square group rather than naming anyone'`, `'slices to the 10 most recent expenses for the median'`, `'hides itself for a group with fewer than two active members'`, and `'hides itself for an archived group'` **untouched**. The median test seeds eleven expenses all paid by Olivia, which leaves Petr and Jana one minor unit apart after largest-remainder rounding — so it must keep asserting only `typicalExpenseMinorUnits`, never the payer list.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
export DATABASE_URL="postgresql://evenup:pass@localhost:55433/evenup"
pnpm --filter @evenup/api exec vitest run src/routers/next-round.test.ts
```

Expected: FAIL — `result.payers` is undefined (the payload still carries `ranked`), and the tied-debtors test still receives `{ state: 'hidden' }`.

- [ ] **Step 3: Reshape the result type**

In `packages/api/src/services/balance-service.ts`, change the `@evenup/core` import so it pulls `rankNextRound` instead of `suggestNextPayer` (keep `type NextPayerCandidate`), and replace the `NextRoundResult` type with:

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

- [ ] **Step 4: Rewrite the tail of `getNextRound`**

Replace everything in `getNextRound` from `// Safe: \`ranked\` is a subset…`(the comment above the`suggestNextPayer`call) through the final`return` statement with:

```ts
const ranking = rankNextRound(candidates, typicalExpenseMinorUnits);
// An empty ranking now means exactly one thing: nobody owes anything.
if (!ranking) return { state: 'square' };

// Safe: every ranked memberId comes from `candidates`, built from `activeMembers`,
// and `byId` is built from `balances`, which covers every member of the group.
const toBalances = (cs: readonly NextPayerCandidate[]) => cs.map((c) => byId.get(c.memberId)!);

return {
  state: 'suggested',
  typicalExpenseMinorUnits,
  clearsGate: ranking.clearsGate,
  payers: toBalances(ranking.payers),
  runnerUp: toBalances(ranking.runnerUp),
};
```

The `anyDebtor` constant and its comment block are deleted: with the gate no longer vetoing, "debtors exist" always yields a suggestion.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
export DATABASE_URL="postgresql://evenup:pass@localhost:55433/evenup"
pnpm --filter @evenup/api exec vitest run src/routers/next-round.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 6: Verify the API package typechecks and its whole suite passes**

```bash
export DATABASE_URL="postgresql://evenup:pass@localhost:55433/evenup"
pnpm --filter @evenup/api typecheck && pnpm --filter @evenup/api test && pnpm --filter @evenup/api lint
```

Expected: PASS — `integration.test.ts` (which exercises `balance.get`) must still pass. Do **not** run root `pnpm typecheck`; `@evenup/web` is expected to be red until Task 4.

- [ ] **Step 7: Commit**

```bash
git add packages/api
git commit -m "feat(api): nextPayer returns tied payers, runner-up, and clearsGate"
```

---

### Task 4: Render the name list

**Files:**

- Modify: `apps/web/src/lib/i18n.tsx`
- Rewrite: `apps/web/src/components/next-round-card.tsx`
- Test: `apps/web/e2e/next-round.spec.ts`

**Interfaces:**

- Consumes: `formatNameList` (Task 1); `trpc.balance.nextPayer` returning `NextRoundResult` (Task 3); message keys `nextRound.title`, `nextRound.titleBehind`, `nextRound.reason`, `nextRound.reasonEach`, `nextRound.runnerUp`, `nextRound.square`.
- Produces: test ids `next-round-card`, `next-round-payer`, `next-round-runner-up` (unchanged names).

**Running the e2e — the main trap.** Playwright's `webServer` runs `next start`, which serves a **production build**, and the tRPC service code is bundled into that server. Rebuild after every change or you silently test the old code. The web package's pnpm filter is `@evenup/web`, and only **chromium** is installed:

```bash
export DATABASE_URL="postgresql://evenup:pass@localhost:55433/evenup"
export ENCRYPTION_KEY=0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0
export BETTER_AUTH_SECRET=e2e-secret-000000000000000000000000

pnpm --filter @evenup/web build
pnpm --filter @evenup/web exec playwright test e2e/next-round.spec.ts --project=chromium
```

- [ ] **Step 1: Write the failing test**

In `apps/web/e2e/next-round.spec.ts`, add a second test inside the existing `test.describe('Next Round card', …)` block. Reuse the same helpers the existing test imports.

Fixture: three equal-split 900 Kč expenses, **all paid by the group creator**. Balances: Olivia +1 800, Petr −900, Jana −900. The median is 900, so the gate is −300 and both debtors clear it — the card uses the confident wording, names both, and shows no runner-up. The UI default locale is Czech, so the title reads `Rundu platí Petr nebo Jana`.

```ts
test('names both members tied at the deepest debt, and shows no runner-up', async ({
  page,
}, testInfo) => {
  await signIn(page, uniqueEmail('tie', testInfo.workerIndex + Date.now()));

  await page.getByTestId('new-group-btn').click();
  await page.getByTestId('group-name-input').fill('Rovnost 2026');
  await page.getByTestId('create-group-submit').click();
  await page.getByText('Rovnost 2026').click();
  await expect(page.getByTestId('group-title')).toHaveText('Rovnost 2026');

  await openGroupSheet(page, 'members');
  for (const name of ['Petr', 'Jana']) {
    await page.getByTestId('member-name-input').fill(name);
    await page.getByTestId('add-member-btn').click();
    await expect(page.getByRole('img', { name }).first()).toBeVisible();
  }
  await closeSheet(page);

  // All three paid by the creator, so Petr and Jana tie at -900 exactly.
  for (const title of ['Chata', 'Vlek', 'Kava']) {
    await page.getByTestId('add-expense-open').click();
    await page.getByTestId('expense-title-input').fill(title);
    await page.getByTestId('expense-amount-input').fill('900');
    await page.getByTestId('add-expense-submit').click();
    await expect(page.getByText(title)).toBeVisible();
  }

  const payer = page.getByTestId('next-round-payer');
  await expect(payer).toBeVisible();
  await expect(payer).toContainText('Petr');
  await expect(payer).toContainText('Jana');
  await expect(page.getByTestId('next-round-runner-up')).toHaveCount(0);
});
```

- [ ] **Step 2: Build and run the test to verify it fails**

```bash
export DATABASE_URL="postgresql://evenup:pass@localhost:55433/evenup"
export ENCRYPTION_KEY=0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0
export BETTER_AUTH_SECRET=e2e-secret-000000000000000000000000
pnpm --filter @evenup/web build
pnpm --filter @evenup/web exec playwright test e2e/next-round.spec.ts --project=chromium
```

Expected: FAIL. The build fails first, because `next-round-card.tsx` still reads `nextRound.data.ranked`, which no longer exists on the payload. That is the red step.

- [ ] **Step 3: Surface `formatNameList` on `useI18n()`**

In `apps/web/src/lib/i18n.tsx`, add `formatNameList as fmtNameList` to the `@evenup/i18n` import, add the field to the interface, and provide it in the memoized value:

```tsx
interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: MessageKey, values?: InterpolationValues) => string;
  formatCurrency: (minor: number, currency: string) => string;
  formatDate: (date: string | Date) => string;
  formatNameList: (names: readonly string[], type: 'conjunction' | 'disjunction') => string;
}
```

```tsx
      formatCurrency: (minor, currency) => fmtCurrency(minor, currency, locale),
      formatDate: (date) => fmtDate(date, locale),
      formatNameList: (names, type) => fmtNameList(names, locale, type),
```

- [ ] **Step 4: Rewrite the card**

Replace the entire contents of `apps/web/src/components/next-round-card.tsx`:

```tsx
'use client';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Card } from '@/components/ui';
import { MemberChip } from '@/components/member-chip';
import { HandCoins } from '@/components/icons';

/**
 * Names who should pay the group's next shared expense, so balances drift toward
 * settled while the group spends. All math lives in `@evenup/core`; this renders.
 *
 * Everyone tied at the deepest debt is named — no member is crowned by an internal
 * id. `clearsGate` chooses the wording, never the silence: when paying would move
 * the named members toward zero the card gives an instruction ("Rundu platí Petr
 * nebo Jana"); when it would not, the card states a fact and promises nothing
 * ("Nejvíc pozadu: Petr a Jana").
 *
 * The runner-up line is the skip mechanism, and it appears only when a single
 * member is named — a tie has already offered the table more than one candidate.
 */
export function NextRoundCard({
  groupId,
  baseCurrency,
}: {
  groupId: string;
  baseCurrency: string;
}) {
  const { t, formatCurrency, formatNameList } = useI18n();
  const nextRound = trpc.balance.nextPayer.useQuery({ groupId });
  const data = nextRound.data;

  if (!data || data.state === 'hidden') return null;

  if (data.state === 'square') {
    return (
      <Card data-testid="next-round-card">
        <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <HandCoins size={16} aria-hidden />
          {t('nextRound.square')}
        </p>
      </Card>
    );
  }

  const { payers, runnerUp, clearsGate } = data;
  if (payers.length === 0) return null;

  const names = payers.map((p) => p.displayName);
  const amount = formatCurrency(Math.abs(payers[0]!.balanceMinorUnits), baseCurrency);

  return (
    <Card data-testid="next-round-card">
      <div className="flex items-center gap-3">
        <span className="flex gap-1">
          {payers.slice(0, 3).map((p) => (
            <MemberChip
              key={p.memberId}
              initials={p.initials}
              color={p.color}
              name={p.displayName}
            />
          ))}
        </span>
        <div className="min-w-0">
          <p
            className="flex items-center gap-1.5 font-semibold"
            data-testid="next-round-payer"
            title={names.join(', ')}
          >
            <HandCoins size={16} aria-hidden />
            {clearsGate
              ? t('nextRound.title', { names: formatNameList(names, 'disjunction') })
              : t('nextRound.titleBehind', { names: formatNameList(names, 'conjunction') })}
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {payers.length > 1
              ? t('nextRound.reasonEach', { amount })
              : t('nextRound.reason', { amount })}
          </p>
        </div>
      </div>

      {runnerUp.length > 0 ? (
        <p
          className="mt-2 border-t border-zinc-100 pt-2 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400"
          data-testid="next-round-runner-up"
        >
          {t('nextRound.runnerUp', {
            names: formatNameList(
              runnerUp.map((r) => r.displayName),
              'conjunction',
            ),
            amount: formatCurrency(runnerUp[0]!.balanceMinorUnits, baseCurrency),
          })}
        </p>
      ) : null}
    </Card>
  );
}
```

The payer's amount goes through `Math.abs` because "behind by" already carries the sign; the runner-up's amount is passed unabsolved so it renders with its minus sign.

- [ ] **Step 5: Rebuild and run both e2e tests to verify they pass**

```bash
export DATABASE_URL="postgresql://evenup:pass@localhost:55433/evenup"
export ENCRYPTION_KEY=0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0
export BETTER_AUTH_SECRET=e2e-secret-000000000000000000000000
pnpm --filter @evenup/web build
pnpm --filter @evenup/web exec playwright test e2e/next-round.spec.ts --project=chromium
```

Expected: PASS, 2 tests. The pre-existing test still names Jana with Petr as runner-up.

- [ ] **Step 6: Typecheck, lint, and run the web regression suite**

```bash
export DATABASE_URL="postgresql://evenup:pass@localhost:55433/evenup"
pnpm --filter @evenup/web typecheck && pnpm --filter @evenup/web lint && pnpm --filter @evenup/web test
pnpm --filter @evenup/web exec playwright test --project=chromium
```

Expected: PASS. `critical-flow.spec.ts` and `two-factor.spec.ts` must still pass. Report honestly if a pre-existing spec fails; do not "fix" unrelated specs.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat(web): Next Round card names every tied debtor"
```

---

## Final verification

- [ ] **Step 1: Format, then run every gate CI runs**

CI runs `pnpm format:check` in addition to ESLint. Run the formatter first or CI fails on files this plan touched.

```bash
export DATABASE_URL="postgresql://evenup:pass@localhost:55433/evenup"
pnpm format
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
```

Expected: all green — `core`, `api`, `db`, `i18n`, `web`.

- [ ] **Step 2: Confirm no migration was created**

```bash
git status --short packages/db/prisma/migrations
```

Expected: empty output.

- [ ] **Step 3: Commit any formatting churn**

```bash
git add -A -- apps packages docs
git commit -m "style: apply prettier formatting"
```

Skip this commit if `git status` is already clean.
