# Duplicate Member Prevention + Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop invitees from creating duplicate accounts instead of claiming the placeholder member that holds their debts, and give admins (and the affected person) a way to merge duplicates that already exist.

**Architecture:** Two independent halves. **Part A** (Tasks 1–4) reworks the invite page so claiming your own name is the primary, balance-annotated action and creating a new account requires a confirmation — this fixes the bleeding and ships on its own. **Part B** (Tasks 5–11) adds `member.merge` / `mergePreview` / `duplicateCandidates` plus the UI to repair existing duplicates. **No database migration is required.**

**Tech Stack:** TypeScript, pnpm + Turborepo monorepo, tRPC + zod, Prisma/PostgreSQL, Next.js App Router, Tailwind, vitest (integration + unit), Playwright (e2e).

## Global Constraints

- **No schema migration.** `packages/db/prisma/schema.prisma` must not change. Every task runs against existing tables.
- **Money is integer minor units.** `BigInt` in Prisma (`amountMinorUnits`, `computedMinorUnits`, `exactMinorUnits`, `baseMinorUnits`, `totalMinorUnits`); `Prisma.Decimal` for `percentage`. **Never use floats in a money path.**
- **Bilingual.** Every user-facing string is added to **both** `packages/i18n/src/locales/cs.ts` and `packages/i18n/src/locales/en.ts`. Czech is the default locale. Never hardcode a string in a component.
- **Accessibility WCAG 2.1 AA (§9.4).** The invite page has an existing axe-core e2e check that must keep passing. Colour is never the only signal.
- **Transfer columns are `fromMemberId` / `toMemberId`.** `TransferFrom` / `TransferTo` are only Prisma _relation_ names — do not use them as column names.
- **Balance rounding limit.** `loadBalanceTransactions` re-allocates each transaction's base total with `allocateByWeights` (largest-remainder, ties break by row index). Merging two rows into one changes the weight vector: **exact** for same-currency transactions (`base === Σ weights` makes `safeAllocate` the identity), **±1 minor unit** possible on cross-currency ones. Assert exactness only for same-currency; assert zero-sum everywhere.
- **Commands** (run from repo root):
  - API tests: `pnpm --filter @evenup/api test`
  - Core tests: `pnpm --filter @evenup/core test`
  - Typecheck all: `pnpm typecheck`
  - Lint all: `pnpm lint`
  - API integration tests need `DATABASE_URL` pointing at a migrated Postgres (`docker compose up -d db`).

---

# Part A — Prevention (ships independently)

### Task 1: `invite.claimOptions` — unclaimed members with balances

The invite page needs each unclaimed member's balance to make "this row is you" obvious. It must **not** go on the existing `invite.preview`, which is a `publicProcedure` — that would leak who-owes-what to anyone merely holding the token, before sign-in. A new **protected** procedure keeps the leak closed.

**Files:**

- Modify: `packages/api/src/routers/invite.ts`
- Test: `packages/api/src/routers/integration.test.ts` (append to the existing `describe('invite claim (FR-1.3, FR-2.5)')` block)

**Interfaces:**

- Consumes: `getGroupBalances(prisma, groupId)` from `packages/api/src/services/balance-service.ts`, returning `{ balances: MemberBalance[], payments, simplified }` where `MemberBalance = { memberId, balanceMinorUnits, displayName, initials, color, image }`.
- Produces: `invite.claimOptions({ token: string })` → `{ groupName: string; baseCurrency: string; members: Array<{ id: string; displayName: string; initials: string; color: string; balanceMinorUnits: number }> }`

- [ ] **Step 1: Write the failing test**

Append to `packages/api/src/routers/integration.test.ts`, inside the `describe('invite claim (FR-1.3, FR-2.5)')` block:

```ts
test('claimOptions returns unclaimed members with their balances, and requires auth', async () => {
  const { caller, group, members } = await seedGroupWithMembers();
  // Olivia pays 900 CZK split equally three ways -> Petr owes 300.00.
  await caller.transaction.createExpense({
    groupId: group.id,
    title: 'Chata',
    currency: 'CZK',
    date: new Date('2026-06-22'),
    payers: [{ memberId: members.olivia.id, amountMinorUnits: 90000 }],
    split: {
      type: 'EQUAL',
      members: [
        { memberId: members.olivia.id },
        { memberId: members.petr.id },
        { memberId: members.jana.id },
      ],
    },
  });
  const invite = await caller.invite.create({ groupId: group.id });

  // Unauthenticated callers are refused — balances must not leak to a bare token holder.
  await expect(makeCaller(null).invite.claimOptions({ token: invite.token })).rejects.toMatchObject(
    { code: 'UNAUTHORIZED' },
  );

  const petrUser = await createTestUser('petr@example.com');
  const options = await makeCaller(petrUser).invite.claimOptions({ token: invite.token });

  expect(options.groupName).toBe('Tatry 2026');
  expect(options.baseCurrency).toBe('CZK');
  const petr = options.members.find((m) => m.id === members.petr.id)!;
  expect(petr.balanceMinorUnits).toBe(-30000);
  expect(petr.displayName).toBe('Petr Svoboda');

  // Olivia's member is already linked to a user, so it is not offered.
  expect(options.members.map((m) => m.id)).not.toContain(members.olivia.id);
});

test('claimOptions rejects an expired invite', async () => {
  const { caller, group } = await seedGroupWithMembers();
  const invite = await caller.invite.create({ groupId: group.id, expiresInDays: 1 });
  await testPrisma.invite.update({
    where: { id: invite.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  const petrUser = await createTestUser('petr@example.com');
  await expect(
    makeCaller(petrUser).invite.claimOptions({ token: invite.token }),
  ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @evenup/api test -- -t "claimOptions"`
Expected: FAIL — `claimOptions is not a function` / property does not exist.

- [ ] **Step 3: Implement `claimOptions`**

In `packages/api/src/routers/invite.ts`, add the import at the top:

```ts
import { getGroupBalances } from '../services/balance-service.js';
```

Then add this procedure to the `inviteRouter`, immediately after `preview`:

```ts
  /**
   * The signed-in invitee's claim list: the same unclaimed members `preview`
   * returns, plus each one's balance so the invitee recognises their own row.
   *
   * Deliberately NOT folded into `preview`: that one is public, and attaching
   * balances there would expose the group's debts to anyone holding the token
   * before they ever sign in.
   */
  claimOptions: protectedProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      const invite = await ctx.prisma.invite.findUnique({
        where: { token: input.token },
        include: { group: { include: { members: true } } },
      });
      if (!invite) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found' });
      if (invite.expiresAt && invite.expiresAt < new Date()) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Invite expired' });
      }

      const { balances } = await getGroupBalances(ctx.prisma, invite.groupId, invite.group);
      const balanceById = new Map(balances.map((b) => [b.memberId, b.balanceMinorUnits]));

      return {
        groupName: invite.group.name,
        baseCurrency: invite.group.baseCurrency,
        members: invite.group.members
          .filter((m) => m.userId === null && m.isActive)
          .map((m) => ({
            id: m.id,
            displayName: m.displayName,
            initials: m.initials,
            color: m.color,
            balanceMinorUnits: balanceById.get(m.id) ?? 0,
          })),
      };
    }),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @evenup/api test -- -t "claimOptions"`
Expected: PASS (2 tests).

Then run the whole suite to confirm nothing regressed:
Run: `pnpm --filter @evenup/api test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/invite.ts packages/api/src/routers/integration.test.ts
git commit -m "feat(api): invite.claimOptions returns unclaimed members with balances

Protected, unlike the public preview, so balances never leak to a bare
token holder."
```

---

### Task 2: i18n keys for the invite page

**Files:**

- Modify: `packages/i18n/src/locales/cs.ts`
- Modify: `packages/i18n/src/locales/en.ts`

**Interfaces:**

- Produces: the translation keys consumed by Task 3. `{amount}` interpolation is supported — `packages/i18n/src/translate.ts` replaces `/\{(\w+)\}/g`.

Note: the existing `balance.owes` / `balance.isOwed` keys are **not** reused — they interpolate `{debtor}`/`{creditor}`/`{member}`, and the invite row already shows the name as its own label, so it needs the bare amount.

- [ ] **Step 1: Add the Czech keys**

In `packages/i18n/src/locales/cs.ts`, next to the existing `invite.*` block (around line 149–156), add:

```ts
  'invite.pickYourName': 'Najdi se v seznamu',
  'invite.thisIsMe': 'To jsem já',
  'invite.notOnList': 'Nejsem v seznamu',
  'invite.confirmNewTitle': 'Opravdu tu nikdo z nich nejsi ty?',
  'invite.confirmNewBody':
    'Když si založíš nový účet, dluhy zůstanou přiřazené původnímu jménu a nikdo je za tebe nepřevezme.',
  'invite.confirmNewCta': 'Přesto založit nový účet',
  'invite.confirmBack': 'Zpět k seznamu',
  'invite.owes': 'dluží {amount}',
  'invite.isOwed': 'má dostat {amount}',
  'invite.settled': 'vyrovnáno',
```

- [ ] **Step 2: Add the English keys**

In `packages/i18n/src/locales/en.ts`, next to the existing `invite.*` block (around line 147–154), add:

```ts
  'invite.pickYourName': 'Find your name below',
  'invite.thisIsMe': 'This is me',
  'invite.notOnList': "I'm not on the list",
  'invite.confirmNewTitle': 'Sure none of these is you?',
  'invite.confirmNewBody':
    'If you create a new account, the debts stay on the original name and nobody takes them over for you.',
  'invite.confirmNewCta': 'Create a new account anyway',
  'invite.confirmBack': 'Back to the list',
  'invite.owes': 'owes {amount}',
  'invite.isOwed': 'is owed {amount}',
  'invite.settled': 'settled up',
```

- [ ] **Step 3: Verify both catalogs still typecheck in lockstep**

The catalogs are keyed by a shared type, so a key present in one and missing from the other is a compile error.

Run: `pnpm typecheck`
Expected: PASS. If it fails with a missing-key error, a key was added to only one file.

Run: `pnpm --filter @evenup/i18n test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/i18n/src/locales/cs.ts packages/i18n/src/locales/en.ts
git commit -m "i18n: invite claim-list, confirmation and balance keys"
```

---

### Task 3: Rework the invite page

The core fix. Three changes: flip the visual hierarchy, show balances, and put a confirmation in front of the new-account path.

**Files:**

- Modify: `apps/web/src/app/invite/[token]/page.tsx` (full rewrite of the signed-in branch)
- Test: covered by e2e in Task 4.

**Interfaces:**

- Consumes: `trpc.invite.claimOptions` (Task 1); the i18n keys from Task 2.
- Consumes: `Modal` from `@/components/modal` — props `{ open: boolean; onClose: () => void; title: string; children: ReactNode; testId?: string }`. Built on native `<dialog>` + `showModal()`, so it provides the focus trap, Escape handling and backdrop for free (needed for the axe check).
- Consumes: `formatCurrency(minorUnits, currency)` from `useI18n()` (the same helper `AmountText` uses internally) to render the balance phrase in one span.
- Consumes: `MemberChip` from `@/components/member-chip`, `Button`/`Card` from `@/components/ui`.
- Produces: `data-testid` hooks used by Task 4 — `invite-member-<id>`, `invite-join-new`, `invite-confirm-new-dialog`, `invite-confirm-new-cta`, `invite-confirm-back`.

**`invite-join-new` keeps its testid** — its role changes from primary CTA to a text link that opens the dialog, but the selector must still resolve.

- [ ] **Step 1: Replace the file**

Write `apps/web/src/app/invite/[token]/page.tsx`:

```tsx
'use client';
import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { Button, Card } from '@/components/ui';
import { Modal } from '@/components/modal';
import { MemberChip } from '@/components/member-chip';
import { SignIn } from '@/components/sign-in';

/** A member's balance rendered as a short, self-contained phrase. */
function BalanceHint({ minorUnits, currency }: { minorUnits: number; currency: string }) {
  const { t, formatCurrency } = useI18n();
  if (minorUnits === 0) {
    return <span className="text-xs text-zinc-500 dark:text-zinc-400">{t('invite.settled')}</span>;
  }
  const key = minorUnits < 0 ? 'invite.owes' : 'invite.isOwed';
  // `whitespace-nowrap` keeps the whole phrase (and therefore the amount)
  // unbroken, which is the design-spec rule AmountText exists to enforce.
  return (
    <span className="text-xs whitespace-nowrap tabular-nums text-zinc-600 dark:text-zinc-300">
      {t(key, { amount: formatCurrency(Math.abs(minorUnits), currency) })}
    </span>
  );
}

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { t } = useI18n();
  const router = useRouter();
  const { data: session, isPending } = useSession();
  // Public, name-only — drives the pre-sign-in group name.
  const preview = trpc.invite.preview.useQuery({ token });
  // Protected, carries balances — only fetched once signed in.
  const options = trpc.invite.claimOptions.useQuery({ token }, { enabled: Boolean(session?.user) });
  const claim = trpc.invite.claim.useMutation({
    onSuccess: () => router.push('/'),
  });
  const [error, setError] = useState<string | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);

  if (isPending) return <p className="py-10 text-center text-zinc-500 dark:text-zinc-400">…</p>;
  if (!session?.user) {
    return (
      <div>
        <p className="mb-4 text-center text-sm text-zinc-600 dark:text-zinc-300">
          {t('invite.claim')}
        </p>
        <SignIn callbackURL={`/invite/${token}`} />
      </div>
    );
  }
  if (options.isLoading || preview.isLoading)
    return <p className="text-zinc-500 dark:text-zinc-400">{t('common.loading')}</p>;
  if (options.isError || !options.data) {
    return (
      <Card>
        <p className="text-red-700 dark:text-red-400">{t('invite.expired')}</p>
      </Card>
    );
  }

  const { groupName, baseCurrency, members } = options.data;
  const joinAsNew = () => claim.mutate({ token }, { onError: (e) => setError(e.message) });

  return (
    <Card>
      <h1 className="mb-1 text-xl font-extrabold tracking-tight">{groupName}</h1>
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-300">
        {members.length > 0 ? t('invite.pickYourName') : t('invite.claim')}
      </p>
      {error ? (
        <p role="alert" className="mb-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {/* Each unclaimed member is a large, primary tap target — picking your own
          name is the main action, not a muted afterthought next to it. */}
      <ul className="space-y-2">
        {members.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              data-testid={`invite-member-${m.id}`}
              disabled={claim.isPending}
              onClick={() =>
                claim.mutate({ token, memberId: m.id }, { onError: (e) => setError(e.message) })
              }
              className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 text-left transition hover:border-zinc-400 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:outline-none disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-500 dark:hover:bg-zinc-800 dark:focus-visible:ring-zinc-100"
            >
              <MemberChip initials={m.initials} color={m.color} name={m.displayName} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{m.displayName}</span>
                <BalanceHint minorUnits={m.balanceMinorUnits} currency={baseCurrency} />
              </span>
              <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                {t('invite.thisIsMe')}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* Demoted from a primary button to a text link, and it no longer mutates
          directly — the confirmation is what actually creates the account. */}
      <div className="mt-4 border-t border-zinc-100 pt-4 text-center dark:border-zinc-800">
        <button
          type="button"
          data-testid="invite-join-new"
          onClick={() => (members.length === 0 ? joinAsNew() : setConfirmNew(true))}
          className="rounded text-sm text-zinc-500 underline underline-offset-4 hover:text-zinc-800 focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:outline-none dark:text-zinc-400 dark:hover:text-zinc-100 dark:focus-visible:ring-zinc-100"
        >
          {t('invite.notOnList')}
        </button>
      </div>

      <Modal
        open={confirmNew}
        onClose={() => setConfirmNew(false)}
        title={t('invite.confirmNewTitle')}
        testId="invite-confirm-new-dialog"
      >
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-300">
          {t('invite.confirmNewBody')}
        </p>
        <ul className="mb-4 space-y-1">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-2 text-sm">
              <MemberChip initials={m.initials} color={m.color} name={m.displayName} size="sm" />
              <span className="min-w-0 flex-1 truncate">{m.displayName}</span>
              <BalanceHint minorUnits={m.balanceMinorUnits} currency={baseCurrency} />
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2">
          <Button data-testid="invite-confirm-back" onClick={() => setConfirmNew(false)}>
            {t('invite.confirmBack')}
          </Button>
          <Button
            variant="secondary"
            data-testid="invite-confirm-new-cta"
            disabled={claim.isPending}
            onClick={() => {
              setConfirmNew(false);
              joinAsNew();
            }}
          >
            {t('invite.confirmNewCta')}
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
```

- [ ] **Step 2: Verify `MemberChip` and `Button` accept the props used above**

Run: `pnpm --filter @evenup/web typecheck`
Expected: PASS.

Both props used above are verified: `Button` (`apps/web/src/components/ui.tsx:18`) spreads `...props` onto the underlying `<button>`, so `data-testid` reaches the DOM, and `MemberChip` accepts `size?: 'xs' | 'sm' | 'md' | 'lg'`.

- [ ] **Step 3: Lint**

Run: `pnpm --filter @evenup/web lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/invite/[token]/page.tsx"
git commit -m "fix(web): make claiming your own name the primary invite action

Member rows become large primary targets annotated with their balance;
'I'm not on the list' drops to a text link behind a confirmation dialog
that re-lists the unclaimed names and what they owe."
```

---

### Task 4: E2E for the invite flow

**Files:**

- Modify: `apps/web/e2e/critical-flow.spec.ts` (update the test at ~line 619–656, add one new test)

**Interfaces:**

- Consumes: the `data-testid` hooks from Task 3.

**This task updates an existing passing test on purpose.** The test at line 653 clicks `invite-join-new` and expects to land on the dashboard immediately; the confirmation dialog breaks that by design.

- [ ] **Step 1: Update the existing "invite link survives sign-in" test**

In `apps/web/e2e/critical-flow.spec.ts`, replace the final block of that test — the three lines starting `await page.getByTestId('invite-join-new').click();` — with:

```ts
// Joining as a brand-new person now goes through the confirmation dialog.
await page.getByTestId('invite-join-new').click();
await expect(page.getByTestId('invite-confirm-new-dialog')).toBeVisible();
await page.getByTestId('invite-confirm-new-cta').click();
await expect(page.getByTestId('group-title')).toHaveCount(0);
await expect(page.getByText('Výlet')).toBeVisible();
```

- [ ] **Step 2: Add a test that claiming your own name is the primary path**

Add this test immediately after the one just updated:

```ts
test('invitee claims the member that already holds their debt', async ({ page }, testInfo) => {
  const owner = uniqueEmail('debt-owner', testInfo.workerIndex + Date.now());
  await signIn(page, owner);

  await page.getByTestId('new-group-btn').click();
  await page.getByTestId('group-name-input').fill('Chata');
  await page.getByTestId('create-group-submit').click();
  await page.getByText('Chata').click();

  // A virtual member who will owe money.
  await openGroupSheet(page, 'members');
  await page.getByTestId('member-name-input').fill('Marek');
  await page.getByTestId('add-member-btn').click();
  await closeSheet(page);

  await openGroupSheet(page, 'invite');
  await page.getByTestId('invite-btn').click();
  const inviteUrl = await page.getByTestId('invite-url').textContent();
  await closeSheet(page);

  const invitee = uniqueEmail('marek', testInfo.workerIndex + Date.now());
  await page.context().clearCookies();
  await page.request.post('/api/auth/sign-up/email', {
    data: { name: 'Marek', email: invitee, password: 'test-password-123' },
  });
  await page.goto(new URL(inviteUrl!).pathname);

  // Marek's own row is a tap target and claiming it lands on the dashboard.
  const row = page.getByRole('button', { name: /Marek/ });
  await expect(row).toBeVisible();
  await row.first().click();
  await expect(page).not.toHaveURL(/\/invite\//);
  await expect(page.getByText('Chata')).toBeVisible();
});
```

The helpers `signIn`, `uniqueEmail`, `openGroupSheet` and `closeSheet` are already
imported at the top of `critical-flow.spec.ts` from `./helpers`. The add-member
testids are `member-name-input` and `add-member-btn` (see
`apps/web/src/components/add-member-form.tsx:34,40`).

- [ ] **Step 3: Run the invite e2e tests**

Run: `pnpm --filter @evenup/web exec playwright test critical-flow --grep "invite"`
Expected: PASS, including the pre-existing `invite page is accessible (§9.4)` axe test — the dialog must not introduce a violation.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/critical-flow.spec.ts
git commit -m "test(web): cover the invite confirmation dialog and claiming your own name

The join-as-new test now passes through the confirmation, which is an
intended behaviour change, not a regression."
```

**Part A is now complete and shippable on its own.**

---

# Part B — Cure: merging duplicates

### Task 5: Name-matching helpers in core

Duplicate detection has to match "Tomáš" with "Tomas" and "tomas" — Czech users will not accept otherwise. Pure functions in `core` so web and mobile share them.

**Files:**

- Modify: `packages/core/src/member/identity.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/member/identity.test.ts` (append)

**Interfaces:**

- Produces: `normalizeForMatch(name: string): string` — lowercase, diacritics stripped, punctuation removed, whitespace collapsed.
- Produces: `nameSimilarity(a: string, b: string): number` — `0`–`1`. Used by Task 8.

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/src/member/identity.test.ts`:

```ts
describe('normalizeForMatch', () => {
  test('folds Czech diacritics and case', () => {
    expect(normalizeForMatch('Tomáš')).toBe('tomas');
    expect(normalizeForMatch('TOMAS')).toBe('tomas');
    expect(normalizeForMatch('Řehoř Žluťoučký')).toBe('rehor zlutoucky');
  });

  test('collapses whitespace and drops punctuation', () => {
    expect(normalizeForMatch('  Jan   Novák.  ')).toBe('jan novak');
    expect(normalizeForMatch('jan.novak')).toBe('jan novak');
  });
});

describe('nameSimilarity', () => {
  test('identical names ignoring case and diacritics score 1', () => {
    expect(nameSimilarity('Marek', 'marek')).toBe(1);
    expect(nameSimilarity('Tomáš', 'Tomas')).toBe(1);
  });

  test('a first name inside a full name scores high', () => {
    expect(nameSimilarity('Marek', 'Marek Novák')).toBeGreaterThanOrEqual(0.8);
    expect(nameSimilarity('jan.novak', 'Jan Novák')).toBeGreaterThanOrEqual(0.8);
  });

  test('unrelated names score low', () => {
    expect(nameSimilarity('Marek', 'Jana Dvořáková')).toBeLessThan(0.5);
    expect(nameSimilarity('Petr', 'Olivia')).toBeLessThan(0.5);
  });

  test('empty input never matches', () => {
    expect(nameSimilarity('', 'Marek')).toBe(0);
    expect(nameSimilarity('Marek', '   ')).toBe(0);
  });
});
```

Add `normalizeForMatch` and `nameSimilarity` to the existing import from `./identity.js` at the top of the test file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @evenup/core test -- -t "normalizeForMatch"`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement the helpers**

Append to `packages/core/src/member/identity.ts`:

```ts
/**
 * Fold a display name to a comparable form: lowercase, diacritics stripped,
 * punctuation reduced to spaces, whitespace collapsed. Czech names differ from
 * their ASCII spellings only by diacritics ("Tomáš" / "Tomas"), and an
 * email-derived name arrives punctuated ("jan.novak"), so both must fold to the
 * same key before any comparison.
 */
export function normalizeForMatch(name: string): string {
  return (
    name
      .normalize('NFD')
      // U+0300–U+036F: the combining diacritical marks NFD just split off.
      // Written as escapes on purpose — literal combining characters are
      // invisible in source and get mangled by copy-paste.
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ')
  );
}

/** Dice coefficient over character bigrams; 1 = identical, 0 = nothing shared. */
function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2);
    bigrams.set(g, (bigrams.get(g) ?? 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2);
    const count = bigrams.get(g) ?? 0;
    if (count > 0) {
      bigrams.set(g, count - 1);
      hits++;
    }
  }
  return (2 * hits) / (a.length - 1 + (b.length - 1));
}

/**
 * How likely two display names refer to the same person, 0–1.
 *
 * Whole-string similarity alone scores "Marek" against "Marek Novák" poorly
 * (the surname is pure noise), yet that is the single most common duplicate
 * shape: `invite.claim` derives the new member's name from the account name or
 * the email local-part, which is usually just the first name. So a full token
 * shared between the two names counts as a strong match on its own.
 */
export function nameSimilarity(a: string, b: string): number {
  const left = normalizeForMatch(a);
  const right = normalizeForMatch(b);
  if (!left || !right) return 0;
  if (left === right) return 1;

  const leftTokens = left.split(' ');
  const rightTokens = right.split(' ');
  const shared = leftTokens.filter((tok) => tok.length > 1 && rightTokens.includes(tok));
  // One shared whole name part (e.g. "marek") is strong evidence on its own.
  const tokenScore =
    shared.length > 0
      ? 0.8 + 0.2 * (shared.length / Math.max(leftTokens.length, rightTokens.length))
      : 0;

  return Math.max(tokenScore, diceCoefficient(left, right));
}
```

Export both from `packages/core/src/index.ts` by adding them to the existing `./member/identity.js` export block (around line 96):

```ts
  normalizeForMatch,
  nameSimilarity,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @evenup/core test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/member/identity.ts packages/core/src/member/identity.test.ts packages/core/src/index.ts
git commit -m "feat(core): diacritic-folding name matching for duplicate detection"
```

---

### Task 6: `member.merge` — authorization and preflight

Validation first, no data movement yet. A reviewer can accept the trust model here and judge the data movement separately in Task 7.

**Files:**

- Modify: `packages/api/src/access.ts` (add a non-throwing `isGroupAdmin`)
- Modify: `packages/api/src/routers/member.ts`
- Create: `packages/api/src/routers/member-merge.test.ts`

**Interfaces:**

- Produces: `isGroupAdmin(prisma: PrismaClient, user: AuthUser, groupId: string): Promise<boolean>` in `access.ts`.
- Produces: `member.merge({ sourceMemberId: string, targetMemberId: string })`. After Task 7 it returns `{ merged: true; targetMemberId: string }`.

- [ ] **Step 1: Write the failing tests**

Create `packages/api/src/routers/member-merge.test.ts`:

```ts
/** member.merge — authorization, preflight refusals (spec 2026-07-25). */
import { beforeEach, describe, expect, test } from 'vitest';
import { makeCaller, createTestUser, resetDb, testPrisma } from '../test/harness.js';

beforeEach(resetDb);

async function seed() {
  const olivia = await createTestUser('olivia@example.com');
  const caller = makeCaller(olivia);
  const group = await caller.group.create({
    name: 'Tatry 2026',
    template: 'TRIP',
    baseCurrency: 'CZK',
  });
  const marek = await caller.member.add({ groupId: group.id, displayName: 'Marek' });
  const jana = await caller.member.add({ groupId: group.id, displayName: 'Jana' });
  return { olivia, caller, group, creator: group.members[0]!, marek, jana };
}

/** Sign a user up and have them join the group as a brand-new member. */
async function joinAsNew(groupId: string, caller: ReturnType<typeof makeCaller>, email: string) {
  const invite = await caller.invite.create({ groupId });
  const user = await createTestUser(email);
  const member = await makeCaller(user).invite.claim({ token: invite.token });
  return { user, member };
}

describe('member.merge preflight', () => {
  test('refuses to merge a member into itself', async () => {
    const { caller, marek } = await seed();
    await expect(
      caller.member.merge({ sourceMemberId: marek.id, targetMemberId: marek.id }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  test('refuses members from different groups', async () => {
    const { caller, marek } = await seed();
    const other = await caller.group.create({
      name: 'Jiná',
      template: 'OTHER',
      baseCurrency: 'CZK',
    });
    await expect(
      caller.member.merge({ sourceMemberId: marek.id, targetMemberId: other.members[0]!.id }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  test('refuses when both members are linked to different accounts', async () => {
    const { caller, group, creator } = await seed();
    const { member: newcomer } = await joinAsNew(group.id, caller, 'marek@example.com');
    await expect(
      caller.member.merge({ sourceMemberId: newcomer.id, targetMemberId: creator.id }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  test('a non-admin may merge their own member into an unclaimed placeholder', async () => {
    const { caller, group, marek } = await seed();
    const { user, member: newcomer } = await joinAsNew(group.id, caller, 'marek@example.com');
    await expect(
      makeCaller(user).member.merge({ sourceMemberId: newcomer.id, targetMemberId: marek.id }),
    ).resolves.toBeTruthy();
  });

  test('a non-admin may not merge a pair that is not theirs', async () => {
    const { caller, group, marek, jana } = await seed();
    const { user } = await joinAsNew(group.id, caller, 'marek@example.com');
    await expect(
      makeCaller(user).member.merge({ sourceMemberId: jana.id, targetMemberId: marek.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  test('a non-admin may not merge into a placeholder that is already claimed', async () => {
    const { caller, group, creator } = await seed();
    const { user, member: newcomer } = await joinAsNew(group.id, caller, 'marek@example.com');
    await expect(
      makeCaller(user).member.merge({ sourceMemberId: newcomer.id, targetMemberId: creator.id }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  test('blocks the merge when a transfer exists directly between the two members', async () => {
    const { caller, group, marek, jana } = await seed();
    // The procedure is `recordTransfer` (not createTransfer) and has NO `title`
    // field — it stores `title: input.note ?? 'Settlement'`.
    await caller.transaction.recordTransfer({
      groupId: group.id,
      fromMemberId: jana.id,
      toMemberId: marek.id,
      amountMinorUnits: 50000,
      currency: 'CZK',
      date: new Date('2026-06-23'),
      note: 'Vyrovnání',
    });
    await expect(
      caller.member.merge({ sourceMemberId: jana.id, targetMemberId: marek.id }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @evenup/api test member-merge`
Expected: FAIL — `member.merge is not a function`.

- [ ] **Step 3: Add `isGroupAdmin` to access.ts**

Append to `packages/api/src/access.ts`:

```ts
/**
 * Non-throwing admin check, for call sites that branch on the answer rather
 * than refusing outright (e.g. member.merge, where a non-admin still has a
 * narrower legitimate path).
 */
export async function isGroupAdmin(
  prisma: PrismaClient,
  user: AuthUser,
  groupId: string,
): Promise<boolean> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      createdById: true,
      members: { where: { userId: user.id, role: 'ADMIN' }, select: { id: true } },
    },
  });
  if (!group) return false;
  return group.createdById === user.id || group.members.length > 0;
}
```

- [ ] **Step 4: Implement the preflight**

In `packages/api/src/routers/member.ts`, extend the access import:

```ts
import { assertGroupAccess, isGroupAdmin } from '../access.js';
```

Add this procedure to `memberRouter`, after `remove`:

```ts
  /**
   * Fold `source` into `target`, deleting `source`.
   *
   * `target` survives so the group keeps the identity it already recognises
   * (name, colour, history) and inherits `source`'s account link. The common
   * case is a newcomer who created a duplicate instead of claiming the
   * placeholder holding their debts (spec 2026-07-25).
   */
  merge: protectedProcedure
    .input(z.object({ sourceMemberId: z.string(), targetMemberId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.sourceMemberId === input.targetMemberId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot merge a member into itself' });
      }
      const [source, target] = await Promise.all([
        ctx.prisma.member.findUnique({ where: { id: input.sourceMemberId } }),
        ctx.prisma.member.findUnique({ where: { id: input.targetMemberId } }),
      ]);
      if (!source || !target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' });
      }
      if (source.groupId !== target.groupId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Members belong to different groups',
        });
      }
      await assertGroupAccess(ctx.prisma, ctx.user, source.groupId);

      // Two real accounts must never be silently collapsed, whoever asks.
      if (source.userId && target.userId && source.userId !== target.userId) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Both members are linked to different accounts',
        });
      }

      // Admins may merge any pair. Anyone else may only fold THEIR OWN member
      // into an unclaimed placeholder — exactly the power invite.claim already
      // grants, so this is no escalation.
      if (!(await isGroupAdmin(ctx.prisma, ctx.user, source.groupId))) {
        if (source.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        if (target.userId !== null) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Member already claimed' });
        }
      }

      // A transfer between the pair would become a payment from a person to
      // themselves. Refuse and name it rather than destroy a money record.
      const selfTransfers = await ctx.prisma.transaction.findMany({
        where: {
          groupId: source.groupId,
          type: 'TRANSFER',
          OR: [
            { fromMemberId: source.id, toMemberId: target.id },
            { fromMemberId: target.id, toMemberId: source.id },
          ],
        },
        select: { id: true, title: true, date: true },
      });
      if (selfTransfers.length > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Resolve the transfer(s) between these members first: ${selfTransfers
            .map((tr) => `${tr.title} (${tr.date.toISOString().slice(0, 10)})`)
            .join(', ')}`,
        });
      }

      return { merged: true, targetMemberId: target.id };
    }),
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @evenup/api test member-merge`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/access.ts packages/api/src/routers/member.ts packages/api/src/routers/member-merge.test.ts
git commit -m "feat(api): member.merge authorization and preflight

Admins merge any pair; anyone else only their own member into an unclaimed
placeholder. Refuses cross-group pairs, two linked accounts, and any pair
with a transfer between them."
```

---

### Task 7: `member.merge` — move the data

**Files:**

- Modify: `packages/api/src/routers/member.ts` (replace the `return { merged: true, ... }` line from Task 6)
- Test: `packages/api/src/routers/member-merge.test.ts` (append)

**Interfaces:**

- Consumes: the preflight from Task 6.
- Produces: `member.merge` now returns `{ merged: true; targetMemberId: string }` **after** moving all rows and deleting `source`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/api/src/routers/member-merge.test.ts`:

```ts
describe('member.merge data movement', () => {
  test('balances are preserved exactly and the source member is gone', async () => {
    const { caller, group, creator, marek, jana } = await seed();
    // Creator pays 900, split equally across all three.
    await caller.transaction.createExpense({
      groupId: group.id,
      title: 'Chata',
      currency: 'CZK',
      date: new Date('2026-06-22'),
      payers: [{ memberId: creator.id, amountMinorUnits: 90000 }],
      split: {
        type: 'EQUAL',
        members: [{ memberId: creator.id }, { memberId: marek.id }, { memberId: jana.id }],
      },
    });

    const before = await caller.balance.get({ groupId: group.id });
    const byId = new Map(before.balances.map((b) => [b.memberId, b.balanceMinorUnits]));
    const expected = byId.get(marek.id)! + byId.get(jana.id)!;

    await caller.member.merge({ sourceMemberId: jana.id, targetMemberId: marek.id });

    const after = await caller.balance.get({ groupId: group.id });
    const afterById = new Map(after.balances.map((b) => [b.memberId, b.balanceMinorUnits]));
    expect(afterById.get(marek.id)).toBe(expected);
    expect(afterById.has(jana.id)).toBe(false);
    expect(await testPrisma.member.findUnique({ where: { id: jana.id } })).toBeNull();

    // The group still nets to zero.
    const total = after.balances.reduce((sum, b) => sum + b.balanceMinorUnits, 0);
    expect(total).toBe(0);
  });

  test('when both members are in the same expense their shares are summed', async () => {
    const { caller, group, creator, marek, jana } = await seed();
    await caller.transaction.createExpense({
      groupId: group.id,
      title: 'Večeře',
      currency: 'CZK',
      date: new Date('2026-06-22'),
      payers: [{ memberId: creator.id, amountMinorUnits: 60000 }],
      split: {
        type: 'EXACT',
        members: [
          { memberId: creator.id, exactMinorUnits: 10000 },
          { memberId: marek.id, exactMinorUnits: 20000 },
          { memberId: jana.id, exactMinorUnits: 30000 },
        ],
      },
    });

    await caller.member.merge({ sourceMemberId: jana.id, targetMemberId: marek.id });

    const splits = await testPrisma.transactionSplit.findMany({
      where: { memberId: marek.id },
    });
    expect(splits).toHaveLength(1);
    expect(Number(splits[0]!.computedMinorUnits)).toBe(50000);

    // The expense's splits still sum to its total.
    const all = await testPrisma.transactionSplit.findMany({
      where: { transactionId: splits[0]!.transactionId },
    });
    const sum = all.reduce((acc, s) => acc + Number(s.computedMinorUnits), 0);
    expect(sum).toBe(60000);
  });

  test('when both members paid the same expense their payments are summed', async () => {
    const { caller, group, creator, marek, jana } = await seed();
    await caller.transaction.createExpense({
      groupId: group.id,
      title: 'Benzín',
      currency: 'CZK',
      date: new Date('2026-06-22'),
      payers: [
        { memberId: marek.id, amountMinorUnits: 40000 },
        { memberId: jana.id, amountMinorUnits: 20000 },
      ],
      split: {
        type: 'EQUAL',
        members: [{ memberId: creator.id }, { memberId: marek.id }, { memberId: jana.id }],
      },
    });

    await caller.member.merge({ sourceMemberId: jana.id, targetMemberId: marek.id });

    const payers = await testPrisma.transactionPayer.findMany({ where: { memberId: marek.id } });
    expect(payers).toHaveLength(1);
    expect(Number(payers[0]!.amountMinorUnits)).toBe(60000);
  });

  test('the target inherits the source account link and keeps its own name', async () => {
    const { caller, group, marek } = await seed();
    const { user, member: newcomer } = await joinAsNew(group.id, caller, 'marek@example.com');

    await caller.member.merge({ sourceMemberId: newcomer.id, targetMemberId: marek.id });

    const merged = await testPrisma.member.findUniqueOrThrow({ where: { id: marek.id } });
    expect(merged.userId).toBe(user.id);
    expect(merged.displayName).toBe('Marek');
  });

  test('records a member.merged activity entry', async () => {
    const { caller, group, marek, jana } = await seed();
    await caller.member.merge({ sourceMemberId: jana.id, targetMemberId: marek.id });
    const logs = await testPrisma.activityLog.findMany({ where: { groupId: group.id } });
    expect(logs.map((l) => l.action)).toContain('member.merged');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @evenup/api test member-merge`
Expected: FAIL — balances unchanged, source member still present.

- [ ] **Step 3: Implement the data movement**

In `packages/api/src/routers/member.ts`, add the `Prisma` import:

```ts
import type { PrismaClient, Prisma } from '@evenup/db';
```

Add these helpers above `memberRouter`:

```ts
/** Sum two nullable numeric columns, staying null only when both sides are null. */
function sumNullable(a: number | null, b: number | null): number | null {
  return a === null && b === null ? null : (a ?? 0) + (b ?? 0);
}

function sumNullableBigInt(a: bigint | null, b: bigint | null): bigint | null {
  return a === null && b === null ? null : (a ?? 0n) + (b ?? 0n);
}

function sumNullableDecimal(
  a: Prisma.Decimal | null,
  b: Prisma.Decimal | null,
): Prisma.Decimal | null {
  if (a === null && b === null) return null;
  if (a === null) return b;
  if (b === null) return a;
  return a.add(b);
}
```

Then replace `return { merged: true, targetMemberId: target.id };` from Task 6 with:

```ts
await ctx.prisma.$transaction(async (tx) => {
  // --- Payers: unique on [transactionId, memberId], so a shared
  // transaction means summing rather than repointing.
  const [sourcePayers, targetPayers] = await Promise.all([
    tx.transactionPayer.findMany({ where: { memberId: source.id } }),
    tx.transactionPayer.findMany({ where: { memberId: target.id } }),
  ]);
  const targetPayerByTxn = new Map(targetPayers.map((p) => [p.transactionId, p]));
  for (const sp of sourcePayers) {
    const tp = targetPayerByTxn.get(sp.transactionId);
    if (tp) {
      await tx.transactionPayer.update({
        where: { id: tp.id },
        data: { amountMinorUnits: tp.amountMinorUnits + sp.amountMinorUnits },
      });
      await tx.transactionPayer.delete({ where: { id: sp.id } });
    } else {
      await tx.transactionPayer.update({
        where: { id: sp.id },
        data: { memberId: target.id },
      });
    }
  }

  // --- Splits: same constraint. Both rows share the transaction's
  // SplitType, so the same nullable columns are populated on both.
  const [sourceSplits, targetSplits] = await Promise.all([
    tx.transactionSplit.findMany({ where: { memberId: source.id } }),
    tx.transactionSplit.findMany({ where: { memberId: target.id } }),
  ]);
  const targetSplitByTxn = new Map(targetSplits.map((s) => [s.transactionId, s]));
  for (const ss of sourceSplits) {
    const ts = targetSplitByTxn.get(ss.transactionId);
    if (ts) {
      await tx.transactionSplit.update({
        where: { id: ts.id },
        data: {
          computedMinorUnits: ts.computedMinorUnits + ss.computedMinorUnits,
          exactMinorUnits: sumNullableBigInt(ts.exactMinorUnits, ss.exactMinorUnits),
          shareWeight: sumNullable(ts.shareWeight, ss.shareWeight),
          percentage: sumNullableDecimal(ts.percentage, ss.percentage),
        },
      });
      await tx.transactionSplit.delete({ where: { id: ss.id } });
    } else {
      await tx.transactionSplit.update({
        where: { id: ss.id },
        data: { memberId: target.id },
      });
    }
  }

  // --- Receipt item assignments: composite PK [receiptItemId, memberId].
  // A shared item just means the source row is redundant.
  const sourceAssignments = await tx.itemAssignment.findMany({
    where: { memberId: source.id },
  });
  for (const sa of sourceAssignments) {
    const existing = await tx.itemAssignment.findUnique({
      where: {
        receiptItemId_memberId: {
          receiptItemId: sa.receiptItemId,
          memberId: target.id,
        },
      },
    });
    if (existing) {
      await tx.itemAssignment.delete({
        where: {
          receiptItemId_memberId: {
            receiptItemId: sa.receiptItemId,
            memberId: source.id,
          },
        },
      });
    } else {
      await tx.itemAssignment.update({
        where: {
          receiptItemId_memberId: {
            receiptItemId: sa.receiptItemId,
            memberId: source.id,
          },
        },
        data: { memberId: target.id },
      });
    }
  }

  // --- Transfers. Any transfer BETWEEN the pair was already rejected in
  // preflight, so nothing here can become a self-transfer.
  await tx.transaction.updateMany({
    where: { fromMemberId: source.id },
    data: { fromMemberId: target.id },
  });
  await tx.transaction.updateMany({
    where: { toMemberId: source.id },
    data: { toMemberId: target.id },
  });

  // --- Bank details: memberId is unique, so the target's own row wins.
  const [sourceBank, targetBank] = await Promise.all([
    tx.bankDetail.findUnique({ where: { memberId: source.id } }),
    tx.bankDetail.findUnique({ where: { memberId: target.id } }),
  ]);
  if (sourceBank && !targetBank) {
    await tx.bankDetail.update({
      where: { memberId: source.id },
      data: { memberId: target.id },
    });
  }

  // --- The surviving member keeps its own identity but gains the link.
  await tx.member.update({
    where: { id: target.id },
    data: { userId: target.userId ?? source.userId },
  });
  await tx.member.delete({ where: { id: source.id } });
});

await logActivity(ctx.prisma, source.groupId, ctx.user.id, 'member.merged', {
  from: source.displayName,
  into: target.displayName,
});

return { merged: true, targetMemberId: target.id };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @evenup/api test member-merge`
Expected: PASS (all preflight + data-movement tests).

Then the full API suite:
Run: `pnpm --filter @evenup/api test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/member.ts packages/api/src/routers/member-merge.test.ts
git commit -m "feat(api): member.merge moves payers, splits, items, transfers and bank details

Collisions on the [transactionId, memberId] uniques sum instead of failing;
the target keeps its identity and inherits the source's account link."
```

---

### Task 8: `member.mergePreview`

No irreversible money operation without showing the arithmetic first.

**Files:**

- Modify: `packages/api/src/routers/member.ts`
- Test: `packages/api/src/routers/member-merge.test.ts` (append)

**Interfaces:**

- Produces: `member.mergePreview({ sourceMemberId, targetMemberId })` → `{ sourceName: string; targetName: string; transactionCount: number; movingBalanceMinorUnits: number; resultingBalanceMinorUnits: number; baseCurrency: string; blockingTransfers: Array<{ id: string; title: string }> }`

- [ ] **Step 1: Write the failing test**

Append to `packages/api/src/routers/member-merge.test.ts`:

```ts
describe('member.mergePreview', () => {
  test('reports what will move and the resulting balance', async () => {
    const { caller, group, creator, marek, jana } = await seed();
    await caller.transaction.createExpense({
      groupId: group.id,
      title: 'Chata',
      currency: 'CZK',
      date: new Date('2026-06-22'),
      payers: [{ memberId: creator.id, amountMinorUnits: 90000 }],
      split: {
        type: 'EQUAL',
        members: [{ memberId: creator.id }, { memberId: marek.id }, { memberId: jana.id }],
      },
    });

    const preview = await caller.member.mergePreview({
      sourceMemberId: jana.id,
      targetMemberId: marek.id,
    });

    expect(preview.sourceName).toBe('Jana');
    expect(preview.targetName).toBe('Marek');
    expect(preview.transactionCount).toBe(1);
    expect(preview.movingBalanceMinorUnits).toBe(-30000);
    expect(preview.resultingBalanceMinorUnits).toBe(-60000);
    expect(preview.baseCurrency).toBe('CZK');
    expect(preview.blockingTransfers).toEqual([]);
  });

  test('surfaces blocking transfers instead of throwing', async () => {
    const { caller, group, marek, jana } = await seed();
    // `note` becomes the transaction's title — recordTransfer has no `title`.
    await caller.transaction.recordTransfer({
      groupId: group.id,
      fromMemberId: jana.id,
      toMemberId: marek.id,
      amountMinorUnits: 50000,
      currency: 'CZK',
      date: new Date('2026-06-23'),
      note: 'Vyrovnání',
    });

    const preview = await caller.member.mergePreview({
      sourceMemberId: jana.id,
      targetMemberId: marek.id,
    });
    expect(preview.blockingTransfers).toHaveLength(1);
    expect(preview.blockingTransfers[0]!.title).toBe('Vyrovnání');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @evenup/api test member-merge -- -t "mergePreview"`
Expected: FAIL — not a function.

- [ ] **Step 3: Implement `mergePreview`**

In `packages/api/src/routers/member.ts`, import the balance service:

```ts
import { getGroupBalances } from '../services/balance-service.js';
```

Add to `memberRouter`:

```ts
  /**
   * What `merge` would do, without doing it. Blocking transfers are RETURNED
   * rather than thrown so the dialog can explain the refusal in place.
   */
  mergePreview: protectedProcedure
    .input(z.object({ sourceMemberId: z.string(), targetMemberId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [source, target] = await Promise.all([
        ctx.prisma.member.findUnique({ where: { id: input.sourceMemberId } }),
        ctx.prisma.member.findUnique({ where: { id: input.targetMemberId } }),
      ]);
      if (!source || !target || source.groupId !== target.groupId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' });
      }
      await assertGroupAccess(ctx.prisma, ctx.user, source.groupId);

      const group = await ctx.prisma.group.findUniqueOrThrow({
        where: { id: source.groupId },
        select: { baseCurrency: true },
      });

      const transactionIds = new Set<string>();
      for (const row of await ctx.prisma.transactionPayer.findMany({
        where: { memberId: source.id },
        select: { transactionId: true },
      })) {
        transactionIds.add(row.transactionId);
      }
      for (const row of await ctx.prisma.transactionSplit.findMany({
        where: { memberId: source.id },
        select: { transactionId: true },
      })) {
        transactionIds.add(row.transactionId);
      }

      const { balances } = await getGroupBalances(ctx.prisma, source.groupId);
      const balanceById = new Map(balances.map((b) => [b.memberId, b.balanceMinorUnits]));
      const moving = balanceById.get(source.id) ?? 0;
      const current = balanceById.get(target.id) ?? 0;

      const blockingTransfers = await ctx.prisma.transaction.findMany({
        where: {
          groupId: source.groupId,
          type: 'TRANSFER',
          OR: [
            { fromMemberId: source.id, toMemberId: target.id },
            { fromMemberId: target.id, toMemberId: source.id },
          ],
        },
        select: { id: true, title: true },
      });

      return {
        sourceName: source.displayName,
        targetName: target.displayName,
        transactionCount: transactionIds.size,
        movingBalanceMinorUnits: moving,
        // Balances are additive across a merge for same-currency groups; a
        // cross-currency group may land ±1 minor unit off (see the plan's
        // Global Constraints), so this is a preview, not a guarantee.
        resultingBalanceMinorUnits: current + moving,
        baseCurrency: group.baseCurrency,
        blockingTransfers,
      };
    }),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @evenup/api test member-merge`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/member.ts packages/api/src/routers/member-merge.test.ts
git commit -m "feat(api): member.mergePreview shows the arithmetic before a merge"
```

---

### Task 9: `member.duplicateCandidates`

**Files:**

- Modify: `packages/api/src/routers/member.ts`
- Test: `packages/api/src/routers/member-merge.test.ts` (append)

**Interfaces:**

- Consumes: `nameSimilarity` from `@evenup/core` (Task 5).
- Produces: `member.duplicateCandidates({ groupId })` → `Array<{ sourceMemberId: string; sourceName: string; targetMemberId: string; targetName: string; score: number }>`, sorted by `score` descending.

- [ ] **Step 1: Write the failing test**

Append to `packages/api/src/routers/member-merge.test.ts`:

```ts
describe('member.duplicateCandidates', () => {
  test('pairs a freshly joined member with a same-named unclaimed placeholder', async () => {
    const { caller, group, marek } = await seed();
    const { member: newcomer } = await joinAsNew(group.id, caller, 'marek@example.com');

    const candidates = await caller.member.duplicateCandidates({ groupId: group.id });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.sourceMemberId).toBe(newcomer.id);
    expect(candidates[0]!.targetMemberId).toBe(marek.id);
  });

  test('does not pair members with unrelated names', async () => {
    const { caller, group } = await seed();
    await joinAsNew(group.id, caller, 'zdenek@example.com');
    const candidates = await caller.member.duplicateCandidates({ groupId: group.id });
    expect(candidates).toEqual([]);
  });

  test('returns nothing once every placeholder is claimed', async () => {
    const { caller, group, marek, jana } = await seed();
    await caller.member.remove({ memberId: jana.id });
    const { member: newcomer } = await joinAsNew(group.id, caller, 'marek@example.com');
    await caller.member.merge({ sourceMemberId: newcomer.id, targetMemberId: marek.id });

    const candidates = await caller.member.duplicateCandidates({ groupId: group.id });
    expect(candidates).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @evenup/api test member-merge -- -t "duplicateCandidates"`
Expected: FAIL — not a function.

- [ ] **Step 3: Implement `duplicateCandidates`**

In `packages/api/src/routers/member.ts`, extend the core import:

```ts
import {
  deriveInitials,
  colorForIndex,
  isValidIban,
  normalizeIban,
  nameSimilarity,
} from '@evenup/core';
```

Add above `memberRouter`:

```ts
/**
 * Below this, two names are not the same person. Deliberately conservative —
 * a false banner asking "is this the same person?" about two genuinely
 * different people is worse than missing one, because the manual merge action
 * covers whatever detection misses.
 */
const DUPLICATE_MATCH_THRESHOLD = 0.8;
```

Add to `memberRouter`:

```ts
  /**
   * Claimed members that look like they duplicate an unclaimed placeholder.
   *
   * `invite.claim` derives a new member's name from the account name or the
   * email local-part, so the duplicate usually carries a recognisable form of
   * the placeholder's name — all three are compared.
   */
  duplicateCandidates: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);
      const members = await ctx.prisma.member.findMany({
        where: { groupId: input.groupId, isActive: true },
        include: { user: { select: { name: true, email: true } } },
      });

      const unclaimed = members.filter((m) => m.userId === null);
      if (unclaimed.length === 0) return [];

      const candidates = [];
      for (const claimed of members.filter((m) => m.userId !== null)) {
        const aliases = [
          claimed.displayName,
          claimed.user?.name ?? '',
          claimed.user?.email?.split('@')[0] ?? '',
        ].filter(Boolean);

        for (const placeholder of unclaimed) {
          const score = Math.max(
            ...aliases.map((alias) => nameSimilarity(alias, placeholder.displayName)),
          );
          if (score >= DUPLICATE_MATCH_THRESHOLD) {
            candidates.push({
              sourceMemberId: claimed.id,
              sourceName: claimed.displayName,
              targetMemberId: placeholder.id,
              targetName: placeholder.displayName,
              score,
            });
          }
        }
      }
      return candidates.sort((a, b) => b.score - a.score);
    }),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @evenup/api test member-merge`
Expected: PASS.

Run: `pnpm --filter @evenup/api test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/member.ts packages/api/src/routers/member-merge.test.ts
git commit -m "feat(api): member.duplicateCandidates matches newcomers to unclaimed placeholders"
```

---

### Task 10: i18n + activity rendering for merges

`ActivityLog.action` is a plain `String` and `logActivity` takes an untyped `action`, so the **server** needed no change. The **client** is where the coupling lives: an action the client does not know renders blank.

**Files:**

- Modify: `packages/i18n/src/locales/cs.ts`
- Modify: `packages/i18n/src/locales/en.ts`
- Modify: `apps/web/src/lib/activity-message.ts`
- Modify: `apps/web/src/components/activity-feed.tsx`

**Interfaces:**

- Produces: the merge-UI strings consumed by Task 11.

- [ ] **Step 1: Add the Czech keys**

In `packages/i18n/src/locales/cs.ts`:

```ts
  'activity.merged': '{actor} sloučil(a) {from} do {into}',
  'merge.title': 'Sloučit členy',
  'merge.bannerQuestion': '{newcomer} se přidal(a), ale {placeholder} je pořád nepřevzatý. Je to stejný člověk?',
  'merge.bannerConfirm': 'Sloučit',
  'merge.bannerDismiss': 'Není',
  'merge.action': 'Sloučit do…',
  'merge.summary': 'Přesune se {count} transakcí a zůstatek {amount} na {target}.',
  'merge.willDelete': '{source} bude smazán(a).',
  'merge.blocked': 'Nejdřív vyřeš převod mezi těmito členy: {titles}',
  'merge.confirm': 'Sloučit',
  'merge.cancel': 'Zrušit',
```

- [ ] **Step 2: Add the English keys**

In `packages/i18n/src/locales/en.ts`:

```ts
  'activity.merged': '{actor} merged {from} into {into}',
  'merge.title': 'Merge members',
  'merge.bannerQuestion': '{newcomer} joined, but {placeholder} is still unclaimed. Same person?',
  'merge.bannerConfirm': 'Merge',
  'merge.bannerDismiss': 'Not the same',
  'merge.action': 'Merge into…',
  'merge.summary': '{count} transactions and a balance of {amount} move to {target}.',
  'merge.willDelete': '{source} will be deleted.',
  'merge.blocked': 'Resolve the transfer between these members first: {titles}',
  'merge.confirm': 'Merge',
  'merge.cancel': 'Cancel',
```

- [ ] **Step 3: Render the activity entry**

In `apps/web/src/lib/activity-message.ts`, add a case to the switch alongside `member.added` / `member.joined`:

```ts
    case 'member.merged':
      return t('activity.merged', { actor, from: str(p.from), into: str(p.into) });
```

In `apps/web/src/components/activity-feed.tsx`, add `'member.merged'` to the action filter list that currently contains `'member.added'` and `'member.joined'` (around line 16).

- [ ] **Step 4: Verify**

Run: `pnpm typecheck`
Expected: PASS — a key present in one catalog but not the other fails here.

Run: `pnpm --filter @evenup/web test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/i18n/src/locales/cs.ts packages/i18n/src/locales/en.ts apps/web/src/lib/activity-message.ts apps/web/src/components/activity-feed.tsx
git commit -m "i18n: merge strings; render member.merged in the activity feed"
```

---

### Task 11: Merge UI — banner and manual merge

**Files:**

- Create: `apps/web/src/components/merge-members.tsx`
- Modify: `apps/web/src/components/group-detail.tsx` (render `<DuplicateBanner>`)
- Modify: `apps/web/src/components/member-list.tsx` (add the per-row "Merge into…" action)

**Interfaces:**

- Consumes: `member.duplicateCandidates`, `member.mergePreview`, `member.merge` (Tasks 6–9); the i18n keys from Task 10; `Modal`, `Button`, `Card`, and `formatCurrency` from `useI18n()`.
- Produces: `<DuplicateBanner groupId={string} />` and `<MergeDialog groupId sourceMemberId targetMemberId onClose />` exported from `merge-members.tsx`.

Dismissal is stored in `localStorage` under `evenup:merge-dismissed`, keyed `"<sourceId>:<targetId>"` — this keeps the change migration-free. The cost is that a dismissal does not follow the user to another device.

- [ ] **Step 1: Create the component**

Write `apps/web/src/components/merge-members.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Button, Card } from '@/components/ui';
import { Modal } from '@/components/modal';

const DISMISS_KEY = 'evenup:merge-dismissed';

function dismissedPairs(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function dismissPair(key: string) {
  try {
    window.localStorage.setItem(DISMISS_KEY, JSON.stringify([...dismissedPairs(), key]));
  } catch {
    // A full or disabled localStorage just means the banner returns later.
  }
}

/** Confirmation dialog: shows what moves before anything is merged. */
export function MergeDialog({
  groupId,
  sourceMemberId,
  targetMemberId,
  onClose,
}: {
  groupId: string;
  sourceMemberId: string;
  targetMemberId: string;
  onClose: () => void;
}) {
  const { t, formatCurrency } = useI18n();
  const utils = trpc.useUtils();
  const preview = trpc.member.mergePreview.useQuery({ sourceMemberId, targetMemberId });
  const merge = trpc.member.merge.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.member.list.invalidate({ groupId }),
        utils.balance.get.invalidate({ groupId }),
        utils.member.duplicateCandidates.invalidate({ groupId }),
        utils.group.get.invalidate({ groupId }),
      ]);
      onClose();
    },
  });

  const blocked = (preview.data?.blockingTransfers.length ?? 0) > 0;

  return (
    <Modal open onClose={onClose} title={t('merge.title')} testId="merge-dialog">
      {preview.isLoading || !preview.data ? (
        <p className="text-zinc-500 dark:text-zinc-400">{t('common.loading')}</p>
      ) : (
        <>
          {blocked ? (
            <p role="alert" className="mb-4 text-sm text-red-700 dark:text-red-400">
              {t('merge.blocked', {
                titles: preview.data.blockingTransfers.map((tr) => tr.title).join(', '),
              })}
            </p>
          ) : (
            <>
              <p className="mb-2 text-sm text-zinc-600 dark:text-zinc-300">
                {t('merge.summary', {
                  count: String(preview.data.transactionCount),
                  amount: formatCurrency(
                    preview.data.movingBalanceMinorUnits,
                    preview.data.baseCurrency,
                  ),
                  target: preview.data.targetName,
                })}
              </p>
              <p className="mb-4 text-sm font-semibold">
                {t('merge.willDelete', { source: preview.data.sourceName })}
              </p>
            </>
          )}
          {merge.error ? (
            <p role="alert" className="mb-2 text-sm text-red-700 dark:text-red-400">
              {merge.error.message}
            </p>
          ) : null}
          <div className="flex flex-col gap-2">
            <Button
              data-testid="merge-confirm"
              disabled={blocked || merge.isPending}
              onClick={() => merge.mutate({ sourceMemberId, targetMemberId })}
            >
              {t('merge.confirm')}
            </Button>
            <Button variant="secondary" onClick={onClose}>
              {t('merge.cancel')}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

/** Suggests a merge when a newcomer looks like an unclaimed placeholder. */
export function DuplicateBanner({ groupId }: { groupId: string }) {
  const { t } = useI18n();
  const candidates = trpc.member.duplicateCandidates.useQuery({ groupId });
  const [dismissed, setDismissed] = useState<string[]>(dismissedPairs);
  const [open, setOpen] = useState(false);

  const candidate = candidates.data?.find(
    (c) => !dismissed.includes(`${c.sourceMemberId}:${c.targetMemberId}`),
  );
  if (!candidate) return null;
  const key = `${candidate.sourceMemberId}:${candidate.targetMemberId}`;

  return (
    <Card className="border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950">
      <p className="mb-3 text-sm" data-testid="merge-banner">
        {t('merge.bannerQuestion', {
          newcomer: candidate.sourceName,
          placeholder: candidate.targetName,
        })}
      </p>
      <div className="flex gap-2">
        <Button data-testid="merge-banner-confirm" onClick={() => setOpen(true)}>
          {t('merge.bannerConfirm')}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            dismissPair(key);
            setDismissed((prev) => [...prev, key]);
          }}
        >
          {t('merge.bannerDismiss')}
        </Button>
      </div>
      {open ? (
        <MergeDialog
          groupId={groupId}
          sourceMemberId={candidate.sourceMemberId}
          targetMemberId={candidate.targetMemberId}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </Card>
  );
}
```

- [ ] **Step 2: Render the banner in the group view**

In `apps/web/src/components/group-detail.tsx`, import and render it above the balances card:

```tsx
import { DuplicateBanner } from '@/components/merge-members';
```

```tsx
<DuplicateBanner groupId={group.id} />
```

- [ ] **Step 3: Export a `Merge` icon**

`apps/web/src/components/icons.tsx` re-exports the lucide icons the app uses;
there is no merge glyph yet. Add `Merge` to **both** the `import { ... } from
'lucide-react'` block at the top and the `export { ... }` block at the bottom,
keeping the existing ordering style.

- [ ] **Step 4: Add the manual merge action to the member list**

`apps/web/src/components/member-list.tsx` renders one `<li>` per member and
already uses the `iconButton` class + an `aria-label`/`title` pair for its
rename control. Mirror exactly that pattern.

Add to the imports:

```tsx
import { Pencil, Check, X, Mail, Merge } from '@/components/icons';
import { MergeDialog } from '@/components/merge-members';
```

Add the state next to the existing `editingId` / `draft` state:

```tsx
const [mergeSourceId, setMergeSourceId] = useState<string | null>(null);
```

In the non-editing branch of the row, add a merge button immediately **before**
the existing pencil button:

```tsx
<button
  type="button"
  onClick={() => setMergeSourceId(m.id)}
  aria-label={`${t('merge.action')} — ${m.displayName}`}
  title={t('merge.action')}
  className={iconButton}
  data-testid={`member-merge-${m.id}`}
>
  <Merge size={16} aria-hidden />
</button>
```

The dialog needs a target, so it opens a picker first. Render this just before
the closing `</ul>`, still inside the component's returned fragment — wrap the
`<ul>` in a `<>…</>` if it is not already:

```tsx
{
  mergeSourceId ? (
    <MergeTargetPicker
      groupId={groupId}
      sourceMemberId={mergeSourceId}
      members={members}
      onClose={() => setMergeSourceId(null)}
    />
  ) : null;
}
```

Then add this component at the bottom of the same file:

```tsx
/**
 * Two-step manual merge: pick who the member is really the same person as, then
 * confirm in MergeDialog (which is where the arithmetic is shown).
 */
function MergeTargetPicker({
  groupId,
  sourceMemberId,
  members,
  onClose,
}: {
  groupId: string;
  sourceMemberId: string;
  members: MemberLite[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [targetId, setTargetId] = useState('');
  const candidates = members.filter((m) => m.id !== sourceMemberId);

  if (targetId) {
    return (
      <MergeDialog
        groupId={groupId}
        sourceMemberId={sourceMemberId}
        targetMemberId={targetId}
        onClose={onClose}
      />
    );
  }
  return (
    <Modal open onClose={onClose} title={t('merge.action')} testId="merge-target-picker">
      <Select
        aria-label={t('merge.action')}
        defaultValue=""
        data-testid="merge-target-select"
        onChange={(e) => setTargetId(e.target.value)}
      >
        <option value="" disabled>
          —
        </option>
        {candidates.map((m) => (
          <option key={m.id} value={m.id}>
            {m.displayName}
          </option>
        ))}
      </Select>
    </Modal>
  );
}
```

Extend the `ui` and `modal` imports at the top of the file to cover the new
primitives:

```tsx
import { Input, Select, iconButtonClass } from '@/components/ui';
import { Modal } from '@/components/modal';
```

- [ ] **Step 5: Verify**

Run: `pnpm --filter @evenup/web typecheck`
Expected: PASS.

Run: `pnpm --filter @evenup/web lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/merge-members.tsx apps/web/src/components/group-detail.tsx apps/web/src/components/member-list.tsx apps/web/src/components/icons.tsx
git commit -m "feat(web): duplicate-member banner and merge confirmation dialog"
```

---

### Task 12: End-to-end merge coverage and final verification

**Files:**

- Modify: `apps/web/e2e/critical-flow.spec.ts`

- [ ] **Step 1: Add the e2e test**

```ts
test('an accidental duplicate can be merged back into the placeholder', async ({
  page,
}, testInfo) => {
  const owner = uniqueEmail('merge-owner', testInfo.workerIndex + Date.now());
  await signIn(page, owner);

  await page.getByTestId('new-group-btn').click();
  await page.getByTestId('group-name-input').fill('Sloučení');
  await page.getByTestId('create-group-submit').click();
  await page.getByText('Sloučení').click();

  await openGroupSheet(page, 'members');
  await page.getByTestId('member-name-input').fill('Marek');
  await page.getByTestId('add-member-btn').click();
  await closeSheet(page);

  await openGroupSheet(page, 'invite');
  await page.getByTestId('invite-btn').click();
  const inviteUrl = await page.getByTestId('invite-url').textContent();
  await closeSheet(page);

  // Marek joins as a new person instead of claiming his own name.
  const invitee = uniqueEmail('marek', testInfo.workerIndex + Date.now());
  await page.context().clearCookies();
  await page.request.post('/api/auth/sign-up/email', {
    data: { name: 'Marek', email: invitee, password: 'test-password-123' },
  });
  await page.goto(new URL(inviteUrl!).pathname);
  await page.getByTestId('invite-join-new').click();
  await page.getByTestId('invite-confirm-new-cta').click();

  // The owner is offered the merge and takes it.
  await page.context().clearCookies();
  await signIn(page, owner);
  await page.getByText('Sloučení').click();
  await expect(page.getByTestId('merge-banner')).toBeVisible();
  await page.getByTestId('merge-banner-confirm').click();
  await page.getByTestId('merge-confirm').click();
  await expect(page.getByTestId('merge-banner')).toHaveCount(0);
});
```

- [ ] **Step 2: Run the full verification sweep**

Run each and confirm PASS before claiming completion:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @evenup/web exec playwright test critical-flow
```

Expected: all PASS. Paste the actual output — do not assert success without it.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/critical-flow.spec.ts
git commit -m "test(web): e2e for merging an accidental duplicate member"
```

---

## Verification checklist

- [ ] `packages/db/prisma/schema.prisma` is unchanged (`git diff --stat` shows no entry for it).
- [ ] Balances net to zero in every group after a merge.
- [ ] The invite page's axe-core e2e check still passes with the dialog present.
- [ ] Every new key exists in **both** `cs.ts` and `en.ts`.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` and the Playwright suite all pass.
