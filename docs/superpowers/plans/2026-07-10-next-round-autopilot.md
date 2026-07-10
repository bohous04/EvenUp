# Next Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a group-screen card that names who should pay for the group's next shared expense, so balances drift toward settled while the group spends rather than after.

**Architecture:** One pure, integer-only ranking function in `packages/core` beside `minimizeDebts`; one tRPC query in `packages/api` that feeds it balances, member weights, `lastPaidAt`, and the group's median expense; one read-only React card in `apps/web` that renders the result and does no math. No schema change, no migration, no new tables.

**Tech Stack:** TypeScript, pnpm + Turborepo monorepo, Vitest + fast-check (unit/property), Prisma + PostgreSQL, tRPC, Next.js App Router, Tailwind, lucide-react, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-10-next-round-autopilot-design.md`

## Global Constraints

- **Integer minor units only.** No floats in any money path. `packages/core` is pure and side-effect free.
- **The gate is `2·b·W + E·(W − w) ≤ 0`**, applied only to candidates with `b < 0`. No tuning constants.
- **Determinism.** Ties break by `lastPaidAt` ascending (`null` first), then by `memberId` — matching the existing `byAmountDescThenId` convention in `packages/core/src/balance/balance.ts`.
- **Czech is the default locale and the source-of-truth catalog shape.** `packages/i18n/src/locales/cs.ts` defines `MessageKey`; `en.ts` is typed `Messages`, so a key added to one and not the other is a **compile error**.
- **Every user-facing string comes from the catalog.** No hard-coded text (FR-10.4).
- **Icons are SVG components, never emoji glyphs.** `apps/web/src/components/icons.tsx` is the only file permitted to import from `lucide-react`; everything else imports from `@/components/icons`.
- **Each i18n key takes the same placeholders in both languages.**
- **No Prisma migration.** All fields used already exist.
- **Commit messages:** conventional commits. Do **not** add a `Co-Authored-By` trailer.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/core/src/balance/next-payer.ts` | **Create.** Pure ranking function + its types. No I/O. |
| `packages/core/src/balance/next-payer.test.ts` | **Create.** Unit + fast-check property tests. |
| `packages/core/src/index.ts` | **Modify.** Re-export the function and its types. |
| `packages/api/src/services/balance-service.ts` | **Modify.** `getNextRound()`: load inputs, call core, shape result. |
| `packages/api/src/routers/balance.ts` | **Modify.** Add the `nextPayer` query. |
| `packages/api/src/routers/next-round.test.ts` | **Create.** Integration tests against ephemeral Postgres. |
| `packages/i18n/src/locales/cs.ts` | **Modify.** Four `nextRound.*` keys. |
| `packages/i18n/src/locales/en.ts` | **Modify.** The same four keys. |
| `apps/web/src/components/icons.tsx` | **Modify.** Import + re-export `HandCoins`. |
| `apps/web/src/components/next-round-card.tsx` | **Create.** The card. Renders; no math. |
| `apps/web/src/components/group-detail.tsx` | **Modify.** Mount the card above `<BalancesCard>`. |
| `apps/web/e2e/next-round.spec.ts` | **Create.** Playwright: hidden under 3 expenses, then names Jana. |

### One deviation from the spec, adopted deliberately

The spec sketched the service returning `{ typicalExpenseMinorUnits, ranked: MemberBalance[] }`. That shape cannot distinguish **"the card is hidden"** (archived group, fewer than two active members, fewer than three expenses) from **"the group is square"** (everyone settled, show the square message) — both yield an empty `ranked`. This plan returns a **discriminated union** on `state` instead. The card branches on `state`, never on `ranked.length`.

---

### Task 1: Core ranking function

**Files:**
- Create: `packages/core/src/balance/next-payer.ts`
- Test: `packages/core/src/balance/next-payer.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface NextPayerCandidate { readonly memberId: string; readonly balanceMinorUnits: number; readonly shareWeight: number; readonly lastPaidAt: number | null }`
  - `function suggestNextPayer(candidates: readonly NextPayerCandidate[], typicalExpenseMinorUnits: number): readonly NextPayerCandidate[]`

**Watch out:** the tiebreak must not compute `at - bt` after substituting `-Infinity` for `null`. Two never-paid members give `-Infinity - -Infinity = NaN`, and a comparator returning `NaN` produces an unspecified order — silently breaking determinism. Compare the `null`s explicitly, as the code below does.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/balance/next-payer.test.ts`:

```ts
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
    const r = suggestNextPayer([c('petr', -89_000), c('filip', -145_000), c('olivia', 234_000)], 180_000);
    expect(ids(r)).toEqual(['filip', 'petr']);
  });

  test('breaks exact balance ties by least recently paid, never-paid first', () => {
    const r = suggestNextPayer(
      [c('recent', -180_000, 1, 5_000), c('never', -180_000, 1, null), c('old', -180_000, 1, 1_000)],
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @evenup/core exec vitest run src/balance/next-payer.test.ts
```

Expected: FAIL — `Failed to resolve import "./next-payer.js"`.

- [ ] **Step 3: Write the implementation**

Create `packages/core/src/balance/next-payer.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @evenup/core exec vitest run src/balance/next-payer.test.ts
```

Expected: PASS, 12 tests.

- [ ] **Step 5: Export from the package barrel**

In `packages/core/src/index.ts`, find the block that exports from `./balance/balance.js` and add immediately after it:

```ts
export { suggestNextPayer, type NextPayerCandidate } from './balance/next-payer.js';
```

- [ ] **Step 6: Typecheck and run the whole core suite**

```bash
pnpm --filter @evenup/core typecheck && pnpm --filter @evenup/core test
```

Expected: no type errors; every test passes, including the pre-existing `balance.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/balance/next-payer.ts packages/core/src/balance/next-payer.test.ts packages/core/src/index.ts
git commit -m "feat(core): suggestNextPayer — integer gate + deterministic ranking"
```

---

### Task 2: API service and query

**Files:**
- Modify: `packages/api/src/services/balance-service.ts`
- Modify: `packages/api/src/routers/balance.ts`
- Test: `packages/api/src/routers/next-round.test.ts`

**Interfaces:**
- Consumes: `suggestNextPayer`, `NextPayerCandidate` from `@evenup/core`; `getGroupBalances`, `MemberBalance` from `./balance-service.js`.
- Produces:
  - `type NextRoundResult = { state: 'hidden' } | { state: 'square' } | { state: 'suggested'; typicalExpenseMinorUnits: number; ranked: MemberBalance[] }`
  - `function getNextRound(prisma: PrismaClient, groupId: string): Promise<NextRoundResult>`
  - tRPC query `balance.nextPayer({ groupId: string })` returning `NextRoundResult`

**Requires a database.** The harness reads `process.env.DATABASE_URL` (`packages/api/src/test/harness.ts`) and expects a migrated Postgres. Bring one up with `docker compose up -d db` and apply migrations with `pnpm --filter @evenup/db exec prisma migrate deploy` before running these tests.

**Why one query, not two:** `lastPaidAt` cannot be a Prisma `groupBy` aggregate — `groupBy` only aggregates scalar columns of the model being grouped, and `TransactionPayer` has no date column. Ordering the expenses by `date desc` once means the *first* row in which a member appears as a payer is their `lastPaidAt`, so a single `findMany` yields both the median and the recency map.

- [ ] **Step 1: Write the failing test**

Create `packages/api/src/routers/next-round.test.ts`:

```ts
/**
 * Integration tests for `balance.nextPayer` (Next Round, PRD §1.2).
 *
 * Fixture arithmetic, in minor units, three equal-weight members:
 *   E1  900 paid by Olivia, split equally 3 ways
 *   E2  900 paid by Olivia, split equally 3 ways
 *   E3  300 paid by Petr,   split equally 3 ways
 *   total 2 100 -> each owes 700
 *   Olivia +110_000   Petr -40_000   Jana -70_000     (sums to zero)
 *   median of [90_000, 90_000, 30_000] = 90_000 = E
 *   gate (w=1, W=3):  2b*3 + 90_000*2 <= 0  =>  b <= -30_000
 *   Jana (-70_000) and Petr (-40_000) qualify; Olivia does not.
 *   ranked = [Jana, Petr]
 */
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { makeCaller, createTestUser, resetDb, testPrisma } from '../test/harness.js';

beforeAll(async () => {
  await testPrisma.$queryRaw`SELECT 1`;
});

beforeEach(async () => {
  await resetDb();
});

async function seedGroup() {
  const olivia = await createTestUser('olivia@example.com');
  const caller = makeCaller(olivia);
  const group = await caller.group.create({
    name: 'Tatry 2026',
    template: 'TRIP',
    baseCurrency: 'CZK',
  });
  const members = {
    olivia: group.members[0]!,
    petr: await caller.member.add({ groupId: group.id, displayName: 'Petr Svoboda' }),
    jana: await caller.member.add({ groupId: group.id, displayName: 'Jana Dvořáková' }),
  };
  const equalSplit = {
    type: 'EQUAL' as const,
    members: [
      { memberId: members.olivia.id },
      { memberId: members.petr.id },
      { memberId: members.jana.id },
    ],
  };
  const expense = (title: string, payerId: string, amount: number, day: string) =>
    caller.transaction.createExpense({
      groupId: group.id,
      title,
      currency: 'CZK',
      date: new Date(day),
      payers: [{ memberId: payerId, amountMinorUnits: amount }],
      split: equalSplit,
    });
  return { caller, group, members, expense };
}

describe('balance.nextPayer', () => {
  test('hides itself below three expenses', async () => {
    const { caller, group, members, expense } = await seedGroup();
    await expense('Chata', members.olivia.id, 90_000, '2026-06-20');
    await expense('Vlek', members.olivia.id, 90_000, '2026-06-21');

    expect(await caller.balance.nextPayer({ groupId: group.id })).toEqual({ state: 'hidden' });
  });

  test('ranks the qualifying debtors deepest-first and reports the median expense', async () => {
    const { caller, group, members, expense } = await seedGroup();
    await expense('Chata', members.olivia.id, 90_000, '2026-06-20');
    await expense('Vlek', members.olivia.id, 90_000, '2026-06-21');
    await expense('Kava', members.petr.id, 30_000, '2026-06-22');

    const result = await caller.balance.nextPayer({ groupId: group.id });
    expect(result.state).toBe('suggested');
    if (result.state !== 'suggested') throw new Error('unreachable');

    expect(result.typicalExpenseMinorUnits).toBe(90_000);
    expect(result.ranked.map((m) => m.displayName)).toEqual(['Jana Dvořáková', 'Petr Svoboda']);
    expect(result.ranked[0]!.balanceMinorUnits).toBe(-70_000);
    expect(result.ranked[0]!.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  test('never names a deactivated member', async () => {
    const { caller, group, members, expense } = await seedGroup();
    await expense('Chata', members.olivia.id, 90_000, '2026-06-20');
    await expense('Vlek', members.olivia.id, 90_000, '2026-06-21');
    await expense('Kava', members.petr.id, 30_000, '2026-06-22');
    await testPrisma.member.update({ where: { id: members.jana.id }, data: { isActive: false } });

    const result = await caller.balance.nextPayer({ groupId: group.id });
    expect(result.state).toBe('suggested');
    if (result.state !== 'suggested') throw new Error('unreachable');
    expect(result.ranked.map((m) => m.memberId)).not.toContain(members.jana.id);
  });

  test('reports a square group rather than naming anyone', async () => {
    const { caller, group, members, expense } = await seedGroup();
    // Each member pays an identical expense split equally: everyone nets to zero.
    await expense('A', members.olivia.id, 90_000, '2026-06-20');
    await expense('B', members.petr.id, 90_000, '2026-06-21');
    await expense('C', members.jana.id, 90_000, '2026-06-22');

    expect(await caller.balance.nextPayer({ groupId: group.id })).toEqual({ state: 'square' });
  });

  test('hides itself for a group with fewer than two active members', async () => {
    const olivia = await createTestUser('solo@example.com');
    const caller = makeCaller(olivia);
    const group = await caller.group.create({ name: 'Solo', template: 'OTHER', baseCurrency: 'CZK' });
    const me = group.members[0]!;
    for (const [i, day] of ['2026-06-20', '2026-06-21', '2026-06-22'].entries()) {
      await caller.transaction.createExpense({
        groupId: group.id,
        title: `Solo ${i}`,
        currency: 'CZK',
        date: new Date(day),
        payers: [{ memberId: me.id, amountMinorUnits: 90_000 }],
        split: { type: 'EQUAL', members: [{ memberId: me.id }] },
      });
    }
    // Three expenses exist, so this is the member guard firing, not the history guard.
    expect(await caller.balance.nextPayer({ groupId: group.id })).toEqual({ state: 'hidden' });
  });

  test('hides itself for an archived group', async () => {
    const { caller, group, members, expense } = await seedGroup();
    await expense('Chata', members.olivia.id, 90_000, '2026-06-20');
    await expense('Vlek', members.olivia.id, 90_000, '2026-06-21');
    await expense('Kava', members.petr.id, 30_000, '2026-06-22');
    await testPrisma.group.update({ where: { id: group.id }, data: { archivedAt: new Date() } });

    expect(await caller.balance.nextPayer({ groupId: group.id })).toEqual({ state: 'hidden' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @evenup/api exec vitest run src/routers/next-round.test.ts
```

Expected: FAIL — `caller.balance.nextPayer is not a function`.

- [ ] **Step 3: Add the service**

Append to `packages/api/src/services/balance-service.ts`. Extend the existing `@evenup/core` import to also pull in `suggestNextPayer` and `type NextPayerCandidate`:

```ts
/** Expenses inspected when estimating the group's typical round. */
const MEDIAN_WINDOW = 10;
/** Below this, a group has no "typical" expense and the card stays hidden. */
const MIN_EXPENSES_FOR_SUGGESTION = 3;

export type NextRoundResult =
  | { readonly state: 'hidden' }
  | { readonly state: 'square' }
  | {
      readonly state: 'suggested';
      readonly typicalExpenseMinorUnits: number;
      readonly ranked: MemberBalance[];
    };

/** Lower median: integer, deterministic, no averaging of two middles. */
function lowerMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[(sorted.length - 1) >> 1]!;
}

/** Who should pay the group's next shared expense (PRD §1.2). */
export async function getNextRound(
  prisma: PrismaClient,
  groupId: string,
): Promise<NextRoundResult> {
  const group = await prisma.group.findUniqueOrThrow({
    where: { id: groupId },
    include: { members: true },
  });
  if (group.archivedAt) return { state: 'hidden' };

  const activeMembers = group.members.filter((m) => m.isActive);
  if (activeMembers.length < 2) return { state: 'hidden' };

  // One ordered pass yields both the median and lastPaidAt. `groupBy` cannot
  // aggregate Transaction.date from TransactionPayer — the date is on the parent.
  // `id` is the tiebreak: two expenses on the same date would otherwise leave the
  // row order — and therefore lastPaidAt — up to Postgres.
  const expenses = await prisma.transaction.findMany({
    where: { groupId, type: 'EXPENSE' },
    select: { date: true, baseMinorUnits: true, payers: { select: { memberId: true } } },
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
  });
  if (expenses.length < MIN_EXPENSES_FOR_SUGGESTION) return { state: 'hidden' };

  const typicalExpenseMinorUnits = lowerMedian(
    expenses.slice(0, MEDIAN_WINDOW).map((e) => toMinor(e.baseMinorUnits)),
  );

  const lastPaidAt = new Map<string, number>();
  for (const e of expenses) {
    for (const p of e.payers) {
      if (!lastPaidAt.has(p.memberId)) lastPaidAt.set(p.memberId, e.date.getTime());
    }
  }

  const { balances } = await getGroupBalances(prisma, groupId);
  const byId = new Map(balances.map((b) => [b.memberId, b]));

  const candidates: NextPayerCandidate[] = activeMembers.map((m) => ({
    memberId: m.id,
    balanceMinorUnits: byId.get(m.id)?.balanceMinorUnits ?? 0,
    shareWeight: m.defaultShare,
    lastPaidAt: lastPaidAt.get(m.id) ?? null,
  }));

  const ranked = suggestNextPayer(candidates, typicalExpenseMinorUnits).map((c) => byId.get(c.memberId)!);
  if (ranked.length === 0) return { state: 'square' };

  return { state: 'suggested', typicalExpenseMinorUnits, ranked };
}
```

- [ ] **Step 4: Add the query**

Rewrite `packages/api/src/routers/balance.ts`:

```ts
/** Balances & suggested settlements (PRD §4.6). */
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { assertGroupAccess } from '../access.js';
import { getGroupBalances, getNextRound } from '../services/balance-service.js';

export const balanceRouter = router({
  get: protectedProcedure.input(z.object({ groupId: z.string() })).query(async ({ ctx, input }) => {
    await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);
    return getGroupBalances(ctx.prisma, input.groupId);
  }),

  nextPayer: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);
      return getNextRound(ctx.prisma, input.groupId);
    }),
});
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter @evenup/api exec vitest run src/routers/next-round.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 6: Typecheck and run the full API suite**

```bash
pnpm --filter @evenup/api typecheck && pnpm --filter @evenup/api test
```

Expected: no type errors; all pre-existing API tests still pass.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/services/balance-service.ts packages/api/src/routers/balance.ts packages/api/src/routers/next-round.test.ts
git commit -m "feat(api): balance.nextPayer query backing the Next Round card"
```

---

### Task 3: Message catalogs

**Files:**
- Modify: `packages/i18n/src/locales/cs.ts`
- Modify: `packages/i18n/src/locales/en.ts`

**Interfaces:**
- Produces: message keys `nextRound.title`, `nextRound.reason`, `nextRound.runnerUp`, `nextRound.square`, consumed by Task 4.

`nextRound.reason` carries no name and no pronoun. The name sits in the title directly above it, and a pronoun would force the string to know the member's gender — which EvenUp does not store and which Czech would need in order to inflect.

- [ ] **Step 1: Add the Czech keys**

In `packages/i18n/src/locales/cs.ts`, immediately after `'balance.suggestedPayments'`, add:

```ts
  'nextRound.title': 'Rundu platí {name}',
  'nextRound.reason': 'Skluz {amount}',
  'nextRound.runnerUp': 'Pak {name} ({amount})',
  'nextRound.square': 'Jste vyrovnaní — další rundu může vzít kdokoli.',
```

- [ ] **Step 2: Run typecheck to verify it fails**

```bash
pnpm --filter @evenup/i18n typecheck
```

Expected: FAIL — `en` is typed `Messages`, so four keys are now missing from it.

- [ ] **Step 3: Add the English keys**

In `packages/i18n/src/locales/en.ts`, at the matching position after `'balance.suggestedPayments'`, add:

```ts
  'nextRound.title': "Next one's on {name}",
  'nextRound.reason': 'Behind by {amount}',
  'nextRound.runnerUp': 'Then {name} ({amount})',
  'nextRound.square': "You're all square — anyone can take the next one.",
```

- [ ] **Step 4: Verify typecheck and catalog parity pass**

```bash
pnpm --filter @evenup/i18n typecheck && pnpm --filter @evenup/i18n test
```

Expected: PASS — including the pre-existing "every locale defines exactly the same keys as Czech" and "no message is left empty" tests.

- [ ] **Step 5: Commit**

```bash
git add packages/i18n/src/locales/cs.ts packages/i18n/src/locales/en.ts
git commit -m "i18n: Next Round card strings (cs + en)"
```

---

### Task 4: The card

**Files:**
- Modify: `apps/web/src/components/icons.tsx`
- Create: `apps/web/src/components/next-round-card.tsx`
- Modify: `apps/web/src/components/group-detail.tsx:144`
- Test: `apps/web/e2e/next-round.spec.ts`

**Interfaces:**
- Consumes: `trpc.balance.nextPayer` (Task 2), the four `nextRound.*` keys (Task 3), `HandCoins` from `@/components/icons`.
- Produces: `<NextRoundCard groupId={string} baseCurrency={string} />`; test ids `next-round-card`, `next-round-payer`, `next-round-runner-up`.

The card branches on `state`, never on `ranked.length` — `hidden` and `square` both carry an empty ranking and must not render the same thing.

- [ ] **Step 1: Write the failing test**

Create `apps/web/e2e/next-round.spec.ts`. The fixture is the arithmetic from Task 2: after three expenses Jana owes 700 Kč and Petr 400 Kč, the gate sits at 300 Kč, so the card names **Jana** with **Petr** as runner-up.

```ts
import { test, expect } from '@playwright/test';
import { signIn, uniqueEmail, openGroupSheet, closeSheet } from './helpers';

test.describe('Next Round card', () => {
  test('stays hidden below three expenses, then names the deepest qualifying debtor', async ({
    page,
  }, testInfo) => {
    await signIn(page, uniqueEmail('olivia', testInfo.workerIndex + Date.now()));

    await page.getByTestId('new-group-btn').click();
    await page.getByTestId('group-name-input').fill('Tatry 2026');
    await page.getByTestId('create-group-submit').click();
    await page.getByText('Tatry 2026').click();
    await expect(page.getByTestId('group-title')).toHaveText('Tatry 2026');

    await openGroupSheet(page, 'members');
    for (const name of ['Petr', 'Jana']) {
      await page.getByTestId('member-name-input').fill(name);
      await page.getByTestId('add-member-btn').click();
      await expect(page.getByText(name)).toBeVisible();
    }
    await closeSheet(page);

    // "Paid by" is a radiogroup of chips with testid `payer-chip-<memberId>`; the
    // ids are cuids the test cannot know, so select by accessible name instead.
    // The payer chips are the only radios in the form that carry member names
    // (the other two radiogroups are split-type and category), so an unscoped
    // `radio` role is unambiguous — and, unlike scoping by the group's aria-label,
    // it does not depend on the active locale. The chip's accessible name combines
    // the inner MemberChip's aria-label with the visible name, so match a regex
    // rather than an exact string. The payer defaults to the group creator, so
    // only the third expense needs a click.
    const addExpense = async (title: string, amount: string, payer?: RegExp) => {
      await page.getByTestId('add-expense-open').click();
      await page.getByTestId('expense-title-input').fill(title);
      await page.getByTestId('expense-amount-input').fill(amount);
      if (payer) await page.getByRole('radio', { name: payer }).click();
      await page.getByTestId('add-expense-submit').click();
      await expect(page.getByText(title)).toBeVisible();
    };

    await addExpense('Chata', '900');
    await addExpense('Vlek', '900');

    // Two expenses: no typical round yet, so no card.
    await expect(page.getByTestId('next-round-card')).toHaveCount(0);

    await addExpense('Kava', '300', /Petr/);

    // Jana owes 700, Petr 400, gate is 300 -> Jana named, Petr runner-up.
    await expect(page.getByTestId('next-round-card')).toBeVisible();
    await expect(page.getByTestId('next-round-payer')).toContainText('Jana');
    await expect(page.getByTestId('next-round-runner-up')).toContainText('Petr');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter web exec playwright test e2e/next-round.spec.ts
```

Expected: FAIL — `next-round-card` never appears.

- [ ] **Step 3: Export the icon**

In `apps/web/src/components/icons.tsx`, add `HandCoins,` to the `lucide-react` import list (after `Beer,`, the last icon before `type LucideIcon`) **and** to the `export { ... }` block at the bottom (after `LogOut,`). This file is the only permitted `lucide-react` import site; everything else imports from `@/components/icons`.

- [ ] **Step 4: Write the card**

Create `apps/web/src/components/next-round-card.tsx`:

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
 * States are disjoint: `hidden` draws nothing (young, archived, or tiny group),
 * `square` says so, `suggested` names a payer and the next in line. The runner-up
 * is the whole skip mechanism — if the named member will not pay, the table can
 * already see who is next, with no button and no persisted state.
 */
export function NextRoundCard({ groupId, baseCurrency }: { groupId: string; baseCurrency: string }) {
  const { t, formatCurrency } = useI18n();
  const nextRound = trpc.balance.nextPayer.useQuery({ groupId });

  if (!nextRound.data || nextRound.data.state === 'hidden') return null;

  if (nextRound.data.state === 'square') {
    return (
      <Card data-testid="next-round-card">
        <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <HandCoins size={16} aria-hidden />
          {t('nextRound.square')}
        </p>
      </Card>
    );
  }

  const [payer, runnerUp] = nextRound.data.ranked;
  if (!payer) return null;

  return (
    <Card data-testid="next-round-card">
      <div className="flex items-center gap-3">
        <MemberChip initials={payer.initials} color={payer.color} name={payer.displayName} />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-semibold" data-testid="next-round-payer">
            <HandCoins size={16} aria-hidden />
            {t('nextRound.title', { name: payer.displayName })}
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {t('nextRound.reason', {
              amount: formatCurrency(Math.abs(payer.balanceMinorUnits), baseCurrency),
            })}
          </p>
        </div>
      </div>

      {runnerUp ? (
        <p
          className="mt-2 border-t border-zinc-100 pt-2 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400"
          data-testid="next-round-runner-up"
        >
          {t('nextRound.runnerUp', {
            name: runnerUp.displayName,
            amount: formatCurrency(runnerUp.balanceMinorUnits, baseCurrency),
          })}
        </p>
      ) : null}
    </Card>
  );
}
```

The card does **not** use `AmountText`, unlike `balances-card.tsx`. Its amounts sit inside interpolated
sentences (`Behind by {amount}`) rather than standalone right-aligned cells, so they go through
`formatCurrency` from `useI18n`. The runner-up amount is passed **unabsolved** so it renders with its
minus sign (`Then Petr (−890 Kč)`); the payer's reason is passed through `Math.abs` because the word
"behind" already carries the sign.

- [ ] **Step 5: Mount the card**

In `apps/web/src/components/group-detail.tsx`, add to the imports beside the existing `BalancesCard` import (line 13):

```tsx
import { NextRoundCard } from '@/components/next-round-card';
```

Then, directly **above** the existing `<BalancesCard ... />` on line 144:

```tsx
<NextRoundCard groupId={groupId} baseCurrency={group.data.baseCurrency} />
```

- [ ] **Step 6: Run the e2e test to verify it passes**

```bash
pnpm --filter web exec playwright test e2e/next-round.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Lint, typecheck, and run the full web suite**

```bash
pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web exec playwright test
```

Expected: no type errors, no lint errors, and the pre-existing `critical-flow.spec.ts` and `two-factor.spec.ts` still pass.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/icons.tsx apps/web/src/components/next-round-card.tsx apps/web/src/components/group-detail.tsx apps/web/e2e/next-round.spec.ts
git commit -m "feat(web): Next Round card on the group screen"
```

---

## Final verification

- [ ] **Run everything from the repo root**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected: green across `core`, `api`, `db`, `i18n`, and `web`.

- [ ] **Confirm no migration was created**

```bash
git status --short packages/db/prisma/migrations
```

Expected: empty output. Next Round adds no schema.
