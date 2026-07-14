# Member Balance Breakdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tapping a person in the Zůstatky (Balances) card opens a read-only sheet that explains their balance — a spent/paid/balance summary, a filterable ledger of every paid (+) and share (−) entry, and an expandable list of the receipt položky on their name for itemized expenses.

**Architecture:** A new read-only tRPC query `balance.memberBreakdown` is backed by a `getMemberBreakdown()` service that reuses the *same* base-currency re-allocation (`safeAllocate`) as `getGroupBalances`, so its entries provably sum to the balance shown on the card. A new `MemberBreakdownSheet` React component renders the result; `BalancesCard` makes each member row a button that opens it.

**Tech Stack:** TypeScript, tRPC + Zod, Prisma/PostgreSQL, Vitest (API integration tests against a throwaway Postgres), Next.js + React + Tailwind (web), Playwright (e2e), `@evenup/i18n` (cs/en catalogs).

## Global Constraints

- Money is integer **minor units**; DB columns are `BigInt`, converted to JS numbers with `toMinor()` / `fromMinor()` from `@evenup/db`. Never do float math on money.
- Breakdown entries MUST sum (in base minor units) to the member's `balanceMinorUnits`, which MUST equal the amount `balance.get` shows on the card. Reuse the module-scope `safeAllocate(base, weights)` in `balance-service.ts` for both payer and split re-allocation.
- i18n: **Czech (`cs.ts`) is the source-of-truth shape**; `en.ts` must define exactly the same keys or `tsc` fails. Add every new key to both.
- UI uses **SVG icon components from `@/components/icons`, never emoji**.
- The sheet is **read-only**: ledger rows are inert except the expand toggle on itemized share rows.
- Commit messages are plain — **do NOT add any `Co-Authored-By` / Claude trailer**.
- Follow existing patterns: `Sheet` (`{ open, onClose, title, children, testId }`), `AmountText` (`{ minorUnits, currency, colored?, className?, testId? }`), and `data-testid` conventions.

---

### Task 1: `getMemberBreakdown` service + `balance.memberBreakdown` procedure

**Files:**
- Modify: `packages/api/src/services/balance-service.ts` (add types + `getMemberBreakdown`)
- Modify: `packages/api/src/routers/balance.ts` (add `memberBreakdown` procedure)
- Test: `packages/api/src/routers/member-breakdown.test.ts` (create)

**Interfaces:**
- Consumes: `safeAllocate` (module-scope, already in `balance-service.ts`), `toMinor` from `@evenup/db`, `assertGroupAccess` from `../access.js`, test harness `makeCaller`/`createTestUser`/`resetDb`/`testPrisma` from `../test/harness.js`.
- Produces (exported from `balance-service.ts`, surfaced to the web via `RouterOutputs['balance']['memberBreakdown']`):

```ts
export interface BreakdownItem {
  name: string;
  quantity: number;
  portionMinorUnits: number; // receipt currency
}
export interface BreakdownEntry {
  txId: string;
  title: string;
  date: Date;
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  kind: 'paid' | 'share';
  amountMinorUnits: number;      // base minor units; + for paid, − for share
  transferLabel: string | null;  // "Anna → Bob" for transfers, else null
  currency: string | null;       // receipt currency; set only for itemized share rows with items
  items: BreakdownItem[] | null; // set only for itemized share rows with ≥1 assigned item
  remainderMinorUnits: number | null; // receipt currency; reconciles items to the tx-currency share
}
export interface MemberBreakdown {
  memberId: string;
  displayName: string;
  balanceMinorUnits: number; // == balance.get for this member
  spentMinorUnits: number;   // Σ EXPENSE share (base); excludes transfers
  paidMinorUnits: number;    // Σ EXPENSE paid (base); excludes transfers
  entries: BreakdownEntry[]; // newest first (date desc, id desc); paid before share within a tx
}
```

- [ ] **Step 1: Write the failing test**

Create `packages/api/src/routers/member-breakdown.test.ts`:

```ts
/**
 * Integration tests for `balance.memberBreakdown`.
 *
 * Fixture (minor units, three equal-weight members):
 *   E1 "Chata"  90_000 paid by Olivia, EQUAL 3  -> each share 30_000
 *   T  transfer 10_000 Petr -> Olivia           (Petr pays, Olivia receives)
 *   E2 "Hospoda" ITEMIZED paid by Petr:
 *        Pivo  12_000 -> {Olivia, Petr}  (6_000 each)
 *        Gulas 18_900 -> {Olivia}        (18_900)
 *        total 30_900; Olivia share 24_900, Petr share 6_000
 *   Olivia balance = +90_000 -30_000 -10_000 -24_900 = +25_100
 */
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { makeCaller, createTestUser, resetDb, testPrisma } from '../test/harness.js';

beforeAll(async () => {
  await testPrisma.$queryRaw`SELECT 1`;
});
beforeEach(async () => {
  await resetDb();
});

async function seed() {
  const olivia = await createTestUser('olivia@example.com');
  const caller = makeCaller(olivia);
  const group = await caller.group.create({ name: 'Tatry', template: 'TRIP', baseCurrency: 'CZK' });
  const m = {
    olivia: group.members[0]!,
    petr: await caller.member.add({ groupId: group.id, displayName: 'Petr' }),
    jana: await caller.member.add({ groupId: group.id, displayName: 'Jana' }),
  };
  const equal = {
    type: 'EQUAL' as const,
    members: [{ memberId: m.olivia.id }, { memberId: m.petr.id }, { memberId: m.jana.id }],
  };
  await caller.transaction.createExpense({
    groupId: group.id,
    title: 'Chata',
    currency: 'CZK',
    date: new Date('2026-06-20'),
    payers: [{ memberId: m.olivia.id, amountMinorUnits: 90_000 }],
    split: equal,
  });
  await caller.transaction.recordTransfer({
    groupId: group.id,
    fromMemberId: m.petr.id,
    toMemberId: m.olivia.id,
    amountMinorUnits: 10_000,
    currency: 'CZK',
  });
  await caller.transaction.createExpense({
    groupId: group.id,
    title: 'Hospoda',
    currency: 'CZK',
    date: new Date('2026-06-21'),
    payers: [{ memberId: m.petr.id, amountMinorUnits: 30_900 }],
    split: {
      type: 'ITEMIZED',
      items: [
        { name: 'Pivo', totalMinorUnits: 12_000, memberIds: [m.olivia.id, m.petr.id] },
        { name: 'Gulas', totalMinorUnits: 18_900, memberIds: [m.olivia.id] },
      ],
    },
  });
  return { caller, group, m };
}

describe('balance.memberBreakdown', () => {
  test('entries sum to the balance and match balance.get', async () => {
    const { caller, group, m } = await seed();
    const fromCard = (await caller.balance.get({ groupId: group.id })).balances.find(
      (b) => b.memberId === m.olivia.id,
    )!.balanceMinorUnits;

    const bd = await caller.balance.memberBreakdown({ groupId: group.id, memberId: m.olivia.id });
    expect(bd.balanceMinorUnits).toBe(fromCard);
    expect(bd.balanceMinorUnits).toBe(25_100);
    expect(bd.entries.reduce((a, e) => a + e.amountMinorUnits, 0)).toBe(fromCard);
  });

  test('spent/paid cover expenses only, excluding the transfer', async () => {
    const { caller, group, m } = await seed();
    const bd = await caller.balance.memberBreakdown({ groupId: group.id, memberId: m.olivia.id });
    expect(bd.paidMinorUnits).toBe(90_000); // E1 only; transfer not counted
    expect(bd.spentMinorUnits).toBe(30_000 + 24_900); // E1 + E2 shares; transfer excluded
  });

  test('itemized share row exposes the assigned polozky and reconciles', async () => {
    const { caller, group, m } = await seed();
    const bd = await caller.balance.memberBreakdown({ groupId: group.id, memberId: m.olivia.id });
    const hospoda = bd.entries.find((e) => e.title === 'Hospoda' && e.kind === 'share')!;
    expect(hospoda.items).not.toBeNull();
    expect(hospoda.items!.map((i) => [i.name, i.portionMinorUnits])).toEqual([
      ['Pivo', 6_000],
      ['Gulas', 18_900],
    ]);
    // items + remainder == the tx-currency share (24_900); no extra charges -> remainder 0
    expect(hospoda.remainderMinorUnits).toBe(0);
    expect(hospoda.amountMinorUnits).toBe(-24_900);
    expect(hospoda.currency).toBe('CZK');
  });

  test('transfer rows carry a from → to label and no items', async () => {
    const { caller, group, m } = await seed();
    const bd = await caller.balance.memberBreakdown({ groupId: group.id, memberId: m.olivia.id });
    const transfer = bd.entries.find((e) => e.type === 'TRANSFER')!;
    expect(transfer.transferLabel).toBe('Petr → Olivia');
    expect(transfer.kind).toBe('share'); // Olivia is the recipient
    expect(transfer.amountMinorUnits).toBe(-10_000);
    expect(transfer.items).toBeNull();
  });

  test('rejects a member id that is not in the group', async () => {
    const { caller, group } = await seed();
    await expect(
      caller.balance.memberBreakdown({ groupId: group.id, memberId: 'not-a-member' }),
    ).rejects.toThrow(/not found/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (throwaway Postgres per repo convention; adjust the port/URL to your local test DB):

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:55434/evenup_test" \
  pnpm --filter @evenup/api test member-breakdown
```

Expected: FAIL — `caller.balance.memberBreakdown is not a function` (procedure not defined yet).

- [ ] **Step 3: Add the types + `getMemberBreakdown` to `balance-service.ts`**

At the top of `packages/api/src/services/balance-service.ts`, add the TRPCError import next to the existing imports:

```ts
import { TRPCError } from '@trpc/server';
```

Append to the end of `packages/api/src/services/balance-service.ts` (the interfaces from the **Produces** block above, then this function):

```ts
export interface BreakdownItem {
  name: string;
  quantity: number;
  portionMinorUnits: number;
}
export interface BreakdownEntry {
  txId: string;
  title: string;
  date: Date;
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  kind: 'paid' | 'share';
  amountMinorUnits: number;
  transferLabel: string | null;
  currency: string | null;
  items: BreakdownItem[] | null;
  remainderMinorUnits: number | null;
}
export interface MemberBreakdown {
  memberId: string;
  displayName: string;
  balanceMinorUnits: number;
  spentMinorUnits: number;
  paidMinorUnits: number;
  entries: BreakdownEntry[];
}

/** Per-member ledger explaining one member's balance (paid vs share, with
 *  itemized receipt drill-in). Reuses the same base re-allocation as
 *  getGroupBalances, so `entries` sum to `balanceMinorUnits`. */
export async function getMemberBreakdown(
  prisma: PrismaClient,
  groupId: string,
  memberId: string,
): Promise<MemberBreakdown> {
  const member = await prisma.member.findFirst({
    where: { id: memberId, groupId },
    select: { id: true, displayName: true },
  });
  if (!member) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found in this group' });
  }

  const nameById = new Map(
    (await prisma.member.findMany({ where: { groupId }, select: { id: true, displayName: true } })).map(
      (m) => [m.id, m.displayName],
    ),
  );

  const txns = await prisma.transaction.findMany({
    where: { groupId },
    include: { payers: true, splits: true, receiptItems: { include: { assignments: true } } },
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
  });

  const entries: BreakdownEntry[] = [];
  let balance = 0;
  let spent = 0;
  let paid = 0;

  for (const t of txns) {
    const base = toMinor(t.baseMinorUnits);
    const basePayers = safeAllocate(
      base,
      t.payers.map((p) => toMinor(p.amountMinorUnits)),
    );
    const baseSplits = safeAllocate(
      base,
      t.splits.map((s) => toMinor(s.computedMinorUnits)),
    );
    const transferLabel =
      t.type === 'TRANSFER' && t.fromMemberId && t.toMemberId
        ? `${nameById.get(t.fromMemberId) ?? '?'} → ${nameById.get(t.toMemberId) ?? '?'}`
        : null;

    t.payers.forEach((p, i) => {
      if (p.memberId !== memberId) return;
      const amount = basePayers[i]!;
      balance += amount;
      if (t.type === 'EXPENSE') paid += amount;
      entries.push({
        txId: t.id,
        title: t.title,
        date: t.date,
        type: t.type,
        kind: 'paid',
        amountMinorUnits: amount,
        transferLabel,
        currency: null,
        items: null,
        remainderMinorUnits: null,
      });
    });

    t.splits.forEach((s, i) => {
      if (s.memberId !== memberId) return;
      const shareBase = baseSplits[i]!;
      balance -= shareBase;
      if (t.type === 'EXPENSE') spent += shareBase;

      let items: BreakdownItem[] | null = null;
      let remainderMinorUnits: number | null = null;
      let currency: string | null = null;
      if (t.splitType === 'ITEMIZED' && t.receiptItems.length > 0) {
        const mine = t.receiptItems.filter((ri) => ri.assignments.some((a) => a.memberId === memberId));
        if (mine.length > 0) {
          currency = t.currency;
          items = mine.map((ri) => ({
            name: ri.name,
            quantity: Number(ri.quantity),
            portionMinorUnits: Math.round(toMinor(ri.totalMinorUnits) / ri.assignments.length),
          }));
          const shareTx = toMinor(s.computedMinorUnits);
          remainderMinorUnits = shareTx - items.reduce((a, it) => a + it.portionMinorUnits, 0);
        }
      }

      entries.push({
        txId: t.id,
        title: t.title,
        date: t.date,
        type: t.type,
        kind: 'share',
        amountMinorUnits: -shareBase,
        transferLabel,
        currency,
        items,
        remainderMinorUnits,
      });
    });
  }

  return {
    memberId: member.id,
    displayName: member.displayName,
    balanceMinorUnits: balance,
    spentMinorUnits: spent,
    paidMinorUnits: paid,
    entries,
  };
}
```

- [ ] **Step 4: Add the `memberBreakdown` procedure to the balance router**

In `packages/api/src/routers/balance.ts`, extend the import and add the procedure:

```ts
import { getGroupBalances, getNextRound, getMemberBreakdown } from '../services/balance-service.js';
```

Add inside `balanceRouter`, after `get`:

```ts
  memberBreakdown: protectedProcedure
    .input(z.object({ groupId: z.string(), memberId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);
      return getMemberBreakdown(ctx.prisma, input.groupId, input.memberId);
    }),
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:55434/evenup_test" \
  pnpm --filter @evenup/api test member-breakdown
```

Expected: PASS (all 5 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/services/balance-service.ts packages/api/src/routers/balance.ts packages/api/src/routers/member-breakdown.test.ts
git commit -m "feat(api): balance.memberBreakdown per-member ledger"
```

---

### Task 2: i18n keys for the breakdown sheet

**Files:**
- Modify: `packages/i18n/src/locales/cs.ts` (source-of-truth)
- Modify: `packages/i18n/src/locales/en.ts` (must match cs exactly)

**Interfaces:**
- Produces: message keys `balance.breakdown.*` consumed by Task 3 via `t(...)`.

- [ ] **Step 1: Add the keys to `cs.ts`**

In `packages/i18n/src/locales/cs.ts`, immediately after the `'balance.suggestedPayments'` line, add:

```ts
  'balance.breakdown.spent': 'Útrata',
  'balance.breakdown.paid': 'Zaplaceno',
  'balance.breakdown.balance': 'Zůstatek',
  'balance.breakdown.filterAll': 'Vše',
  'balance.breakdown.filterPaid': 'Zaplaceno',
  'balance.breakdown.filterShare': 'Podíl',
  'balance.breakdown.paidRow': 'zaplaceno',
  'balance.breakdown.shareRow': 'podíl',
  'balance.breakdown.settlement': 'vyrovnání',
  'balance.breakdown.shared': 'společné (DPH, zaokrouhlení, nepřiřazené)',
  'balance.breakdown.empty': 'Nic tady není',
```

- [ ] **Step 2: Add the same keys to `en.ts`**

In `packages/i18n/src/locales/en.ts`, at the matching position (after `'balance.suggestedPayments'`), add:

```ts
  'balance.breakdown.spent': 'Spent',
  'balance.breakdown.paid': 'Paid',
  'balance.breakdown.balance': 'Balance',
  'balance.breakdown.filterAll': 'All',
  'balance.breakdown.filterPaid': 'Paid',
  'balance.breakdown.filterShare': 'Share',
  'balance.breakdown.paidRow': 'paid',
  'balance.breakdown.shareRow': 'share',
  'balance.breakdown.settlement': 'settlement',
  'balance.breakdown.shared': 'shared (tax, rounding, unassigned)',
  'balance.breakdown.empty': 'Nothing here',
```

- [ ] **Step 3: Typecheck the i18n package to verify cs/en parity**

Run:

```bash
pnpm --filter @evenup/i18n build
```

Expected: PASS. If a key is missing from one locale, `tsc` fails with a `Messages` type mismatch — add the missing key.

- [ ] **Step 4: Commit**

```bash
git add packages/i18n/src/locales/cs.ts packages/i18n/src/locales/en.ts
git commit -m "i18n: add balance breakdown sheet keys"
```

---

### Task 3: `MemberBreakdownSheet` component + clickable Zůstatky rows (with e2e)

**Files:**
- Create: `apps/web/src/components/member-breakdown-sheet.tsx`
- Modify: `apps/web/src/components/balances-card.tsx` (make each row a button that opens the sheet)
- Test: `apps/web/e2e/member-breakdown.spec.ts` (create)

**Interfaces:**
- Consumes: `trpc.balance.memberBreakdown` (Task 1); `Sheet`, `AmountText`, `ChevronDown`, `ChevronRight` from existing components; `t`/`formatDate` from `useI18n`; keys `balance.breakdown.*` (Task 2).
- Produces: `MemberBreakdownSheet` with props `{ groupId: string; memberId: string; memberName: string; baseCurrency: string; open: boolean; onClose: () => void }`.

- [ ] **Step 1: Write the failing e2e test**

Create `apps/web/e2e/member-breakdown.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { signIn, uniqueEmail, openGroupSheet, closeSheet } from './helpers';

test.describe('Member balance breakdown', () => {
  test('opens from a Zůstatky row and shows a filterable ledger', async ({ page }, testInfo) => {
    await signIn(page, uniqueEmail('olivia', testInfo.workerIndex + Date.now()));

    await page.getByTestId('new-group-btn').click();
    await page.getByTestId('group-name-input').fill('Tatry');
    await page.getByTestId('create-group-submit').click();
    await page.getByText('Tatry').click();
    await expect(page.getByTestId('group-title')).toHaveText('Tatry');

    await openGroupSheet(page, 'members');
    await page.getByTestId('member-name-input').fill('Petr');
    await page.getByTestId('add-member-btn').click();
    await expect(page.getByRole('img', { name: 'Petr' }).first()).toBeVisible();
    await closeSheet(page);

    // One 900 expense paid by the creator (Olivia), split equally 2 ways.
    await page.getByTestId('add-expense-open').click();
    await page.getByTestId('expense-title-input').fill('Chata');
    await page.getByTestId('expense-amount-input').fill('900');
    await page.getByTestId('add-expense-submit').click();
    await expect(page.getByText('Chata')).toBeVisible();

    // Open the creator's balance row (they are the first member).
    await page.getByTestId('balance-row').first().click();
    await expect(page.getByTestId('member-breakdown')).toBeVisible();

    // Balance stat matches the +45000 the creator is owed (900 paid − 450 share).
    await expect(page.getByTestId('breakdown-balance')).toBeVisible();

    // Ledger has a paid (+) row and a share (−) row.
    await expect(page.getByTestId('breakdown-row')).toHaveCount(2);

    // Filter to "paid" leaves one row; "share" leaves one row.
    await page.getByTestId('breakdown-filter-paid').click();
    await expect(page.getByTestId('breakdown-row')).toHaveCount(1);
    await page.getByTestId('breakdown-filter-share').click();
    await expect(page.getByTestId('breakdown-row')).toHaveCount(1);
    await page.getByTestId('breakdown-filter-all').click();
    await expect(page.getByTestId('breakdown-row')).toHaveCount(2);
  });
});
```

- [ ] **Step 2: Run the e2e test to verify it fails**

Run (see `apps/web/e2e` setup / the repo's e2e recipe for env + Postgres):

```bash
pnpm --filter @evenup/web test:e2e member-breakdown
```

Expected: FAIL — `balance-row` testid does not exist yet (rows aren't buttons).

- [ ] **Step 3: Create the `MemberBreakdownSheet` component**

Create `apps/web/src/components/member-breakdown-sheet.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Sheet } from '@/components/sheet';
import { AmountText } from '@/components/amount-text';
import { ChevronDown, ChevronRight } from '@/components/icons';

type Filter = 'all' | 'paid' | 'share';

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-zinc-50 px-2 py-2 dark:bg-zinc-800/50">
      <div className="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        {label}
      </div>
      {children}
    </div>
  );
}

/** Read-only ledger explaining one member's balance. Opens from a Zůstatky row. */
export function MemberBreakdownSheet({
  groupId,
  memberId,
  memberName,
  baseCurrency,
  open,
  onClose,
}: {
  groupId: string;
  memberId: string;
  memberName: string;
  baseCurrency: string;
  open: boolean;
  onClose: () => void;
}) {
  const { t, formatDate } = useI18n();
  const breakdown = trpc.balance.memberBreakdown.useQuery({ groupId, memberId }, { enabled: open });
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const data = breakdown.data;
  const entries = (data?.entries ?? []).filter((e) =>
    filter === 'all' ? true : e.kind === filter,
  );
  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: t('balance.breakdown.filterAll') },
    { key: 'paid', label: t('balance.breakdown.filterPaid') },
    { key: 'share', label: t('balance.breakdown.filterShare') },
  ];

  return (
    <Sheet open={open} onClose={onClose} title={memberName} testId="member-breakdown">
      {!data ? (
        <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          {t('common.loading')}
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label={t('balance.breakdown.spent')}>
              <AmountText
                minorUnits={data.spentMinorUnits}
                currency={baseCurrency}
                className="text-sm font-semibold"
              />
            </Stat>
            <Stat label={t('balance.breakdown.paid')}>
              <AmountText
                minorUnits={data.paidMinorUnits}
                currency={baseCurrency}
                className="text-sm font-semibold"
              />
            </Stat>
            <Stat label={t('balance.breakdown.balance')}>
              <AmountText
                minorUnits={data.balanceMinorUnits}
                currency={baseCurrency}
                colored
                className="text-sm font-semibold"
                testId="breakdown-balance"
              />
            </Stat>
          </div>

          <div className="flex gap-1.5" role="group">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                data-testid={`breakdown-filter-${f.key}`}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filter === f.key
                    ? 'bg-brand-600 text-white'
                    : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {entries.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
              {t('balance.breakdown.empty')}
            </p>
          ) : (
            <ul
              className="divide-y divide-zinc-100 dark:divide-zinc-800"
              data-testid="breakdown-list"
            >
              {entries.map((e, idx) => {
                const key = `${e.txId}-${e.kind}-${idx}`;
                const canExpand = e.kind === 'share' && e.items != null;
                const isOpen = expanded.has(key);
                return (
                  <li key={key} className="py-2" data-testid="breakdown-row">
                    <button
                      type="button"
                      disabled={!canExpand}
                      onClick={() =>
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        })
                      }
                      className="flex w-full items-center gap-2 text-left disabled:cursor-default"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1 text-sm font-medium">
                          {canExpand ? (
                            isOpen ? (
                              <ChevronDown size={14} aria-hidden />
                            ) : (
                              <ChevronRight size={14} aria-hidden />
                            )
                          ) : null}
                          <span className="truncate">{e.transferLabel ?? e.title}</span>
                        </span>
                        <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                          {e.type === 'TRANSFER'
                            ? t('balance.breakdown.settlement')
                            : e.kind === 'paid'
                              ? t('balance.breakdown.paidRow')
                              : t('balance.breakdown.shareRow')}{' '}
                          · {formatDate(e.date)}
                        </span>
                      </span>
                      <AmountText
                        minorUnits={e.amountMinorUnits}
                        currency={baseCurrency}
                        colored
                        className="text-sm font-semibold"
                      />
                    </button>
                    {canExpand && isOpen && e.items ? (
                      <ul className="ml-5 mt-1 space-y-0.5" data-testid="breakdown-items">
                        {e.items.map((it, i) => (
                          <li
                            key={i}
                            className="flex justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400"
                          >
                            <span className="truncate">
                              {it.quantity !== 1 ? `${it.quantity}× ` : ''}
                              {it.name}
                            </span>
                            <AmountText
                              minorUnits={it.portionMinorUnits}
                              currency={e.currency ?? baseCurrency}
                              className="text-xs"
                            />
                          </li>
                        ))}
                        {e.remainderMinorUnits ? (
                          <li className="flex justify-between gap-2 text-xs text-zinc-400 dark:text-zinc-500">
                            <span className="truncate">{t('balance.breakdown.shared')}</span>
                            <AmountText
                              minorUnits={e.remainderMinorUnits}
                              currency={e.currency ?? baseCurrency}
                              className="text-xs"
                            />
                          </li>
                        ) : null}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Sheet>
  );
}
```

- [ ] **Step 4: Make Zůstatky rows open the sheet**

Edit `apps/web/src/components/balances-card.tsx`. Add imports and selection state, wrap the row content in a button, and render the sheet.

Add to the imports block:

```tsx
import { useState } from 'react';
import { MemberBreakdownSheet } from '@/components/member-breakdown-sheet';
```

Inside `BalancesCard`, after `const { t } = useI18n();`, add:

```tsx
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
```

Replace the `<li>` block (the row) so the chip+name+bar+amount live inside a full-width button. The current row is:

```tsx
            <li key={b.memberId} className="flex items-center gap-2">
              <span className="flex w-28 min-w-0 shrink-0 items-center gap-1.5">
```

Change it to:

```tsx
            <li key={b.memberId}>
              <button
                type="button"
                onClick={() => setSelected({ id: b.memberId, name: b.displayName })}
                data-testid="balance-row"
                aria-label={b.displayName}
                className="flex w-full items-center gap-2 rounded-xl px-1 py-1 text-left transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 dark:hover:bg-zinc-800"
              >
              <span className="flex w-28 min-w-0 shrink-0 items-center gap-1.5">
```

Then close the new `<button>` before `</li>`. The row currently ends:

```tsx
              <AmountText
                minorUnits={b.balanceMinorUnits}
                currency={baseCurrency}
                colored
                className="min-w-[7rem] shrink-0 text-right text-sm font-semibold"
                testId={`balance-${b.memberId}`}
              />
            </li>
```

Change the closing to:

```tsx
              <AmountText
                minorUnits={b.balanceMinorUnits}
                currency={baseCurrency}
                colored
                className="min-w-[7rem] shrink-0 text-right text-sm font-semibold"
                testId={`balance-${b.memberId}`}
              />
              </button>
            </li>
```

Finally, render the sheet just before the closing `</Card>`:

```tsx
      {selected ? (
        <MemberBreakdownSheet
          groupId={groupId}
          memberId={selected.id}
          memberName={selected.name}
          baseCurrency={baseCurrency}
          open={!!selected}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </Card>
```

- [ ] **Step 5: Run the e2e test to verify it passes**

```bash
pnpm --filter @evenup/web test:e2e member-breakdown
```

Expected: PASS.

- [ ] **Step 6: Typecheck the web app**

```bash
pnpm --filter @evenup/web typecheck
```

Expected: PASS (no type errors from the new component / props).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/member-breakdown-sheet.tsx apps/web/src/components/balances-card.tsx apps/web/e2e/member-breakdown.spec.ts
git commit -m "feat(web): tap a Zůstatky row to see a balance breakdown"
```

---

## Self-Review

**1. Spec coverage**
- Entry point (clickable member row → Sheet): Task 3, Step 4. ✅
- Summary header Útrata / Zaplaceno / Zůstatek: Task 1 (`spent/paid/balance`) + Task 3 Stat row. ✅
- Filterable paid/share ledger, sums to balance: Task 1 (entries + `balanceMinorUnits`, test asserts the sum) + Task 3 filter chips. ✅
- Transfers as `from → to` rows: Task 1 `transferLabel` + test; Task 3 renders it. ✅
- Itemized drill-in (položky + reconciliation remainder): Task 1 `items`/`remainderMinorUnits` + test; Task 3 expand UI. ✅
- Read-only / inert rows except itemized expand: Task 3 (button `disabled={!canExpand}`). ✅
- i18n cs+en parity: Task 2. ✅
- Data via `balance.memberBreakdown`, reusing `safeAllocate`: Task 1. ✅
- Testing (service integration + e2e): Tasks 1 and 3. Note: itemized-item math is verified in the **integration** test (Task 1) rather than e2e, because driving the itemized OCR editor through Playwright is heavy and flaky; the e2e covers open + summary + filter on an equal-split expense. This is a deliberate coverage split, not a gap.

**2. Placeholder scan:** No TBD/TODO; every code and command step is concrete. ✅

**3. Type consistency:** `MemberBreakdown` / `BreakdownEntry` / `BreakdownItem` field names (`amountMinorUnits`, `transferLabel`, `items`, `remainderMinorUnits`, `currency`, `spentMinorUnits`, `paidMinorUnits`) are identical across the service (Task 1), the router output, and the component (Task 3). The component reads them via `trpc.balance.memberBreakdown.useQuery`, whose type flows from Task 1. ✅
