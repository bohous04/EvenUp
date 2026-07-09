# Custom Expense Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-group custom expense categories (name + curated icon) managed from the group `⋯` menu, usable in the expense sheet and stats, with delete-reassigns-to-"other" — per spec `docs/superpowers/specs/2026-07-09-custom-categories-design.md`.

**Architecture:** New `GroupCategory` table; transactions reference customs as `custom:<id>` strings (built-ins unchanged); core's `summarizeByCategory` learns an opt-in `customKeys` set; a new `category` tRPC router (CRUD + reassign-on-delete); web adds a management sheet, extends the expense grid and stats labels.

**Tech Stack:** Prisma/PostgreSQL, tRPC + zod, vitest (core + API harness `makeCaller`/`createTestUser`/`testPrisma`/`resetDb`), Next.js + redesign kit, Playwright e2e.

## Global Constraints

- Icons: semantic lucide kebab-case names only, mapped to SVG components in `icons.tsx` — **never emoji** (standing rule).
- Every new user-facing string in BOTH `packages/i18n/src/locales/cs.ts` (Messages source) and `en.ts`; Czech uses **vykání**.
- All category procedures behind `assertGroupAccess`; deletion reassigns in ONE transaction; no data loss.
- `summarizeByCategory` without opts must behave byte-for-byte as today (backward compat unit-tested).
- Kit styling (Card/SectionLabel/Sheet/EmptyState; muted text `text-zinc-500 dark:text-zinc-400`); axe wcag2a/aa stays green; never weaken assertions.
- Conventional commits; **NEVER any Co-Authored-By/Claude attribution trailer**.
- Working dir: `/Users/michallenert/My-Repositories/apps/EvenUp/.claude/worktrees/categories`; `git rev-parse --abbrev-ref HEAD` must print `worktree-categories` before every commit.
- **Environment:** e2e Postgres container `evenup-e2e-db` (localhost:55433, evenup/pass) — already running; API test DB `evenup_test` in the same container: run API tests with `DATABASE_URL='postgresql://evenup:pass@localhost:55433/evenup_test'`. Prisma migrate dev: `DATABASE_URL='postgresql://evenup:pass@localhost:55433/evenup'`; after Task 2 also `migrate deploy` to `evenup_test`. E2E wrapper: create `.superpowers/sdd/e2e.sh` equal to the account-settings worktree's one (env vars from ci.yml + build + playwright) or run the equivalent commands inline.

---

### Task 1: Core — custom-category primitives + summarize opts

**Files:**
- Modify: `packages/core/src/category/category.ts`
- Modify: `packages/core/src/category/category.test.ts` (add cases)
- Modify: `packages/core/src/index.ts` (export additions)

**Interfaces:**
- Produces: `CUSTOM_CATEGORY_ICONS: readonly string[]` (exactly: the ten built-in iconNames plus `'dog','gift','coffee','dumbbell','music','wrench','fuel','baby','gamepad-2','beer'`), `isCustomCategoryKey(key: string): boolean` (`/^custom:[a-z0-9]+$/`), and `summarizeByCategory(transactions, opts?: { customKeys?: ReadonlySet<string> })` where keys in `customKeys` survive as own buckets.

- [ ] **Step 1: Write the failing tests** (append to `category.test.ts`)

```ts
describe('custom categories', () => {
  it('isCustomCategoryKey matches only custom:<id>', () => {
    expect(isCustomCategoryKey('custom:abc123')).toBe(true);
    expect(isCustomCategoryKey('groceries')).toBe(false);
    expect(isCustomCategoryKey('custom:')).toBe(false);
    expect(isCustomCategoryKey('custom:ABC')).toBe(false);
  });

  it('CUSTOM_CATEGORY_ICONS contains the built-in icons and no duplicates', () => {
    for (const c of EXPENSE_CATEGORIES) expect(CUSTOM_CATEGORY_ICONS).toContain(c.iconName);
    expect(new Set(CUSTOM_CATEGORY_ICONS).size).toBe(CUSTOM_CATEGORY_ICONS.length);
  });

  it('summarizeByCategory keeps customKeys as own buckets, folds dangling ones', () => {
    const txns = [
      { type: 'expense', category: 'custom:live1', baseMinorUnits: 100 },
      { type: 'expense', category: 'custom:gone9', baseMinorUnits: 50 },
      { type: 'expense', category: 'groceries', baseMinorUnits: 25 },
    ] as const;
    const withOpts = summarizeByCategory(txns, { customKeys: new Set(['custom:live1']) });
    expect(withOpts.find((s) => s.category === 'custom:live1')?.totalMinorUnits).toBe(100);
    expect(withOpts.find((s) => s.category === 'other')?.totalMinorUnits).toBe(50);
    // Without opts: byte-for-byte legacy behavior — everything custom folds to other.
    const legacy = summarizeByCategory(txns);
    expect(legacy.find((s) => s.category === 'other')?.totalMinorUnits).toBe(150);
    expect(legacy.some((s) => s.category.startsWith('custom:'))).toBe(false);
  });
});
```

(Import the new symbols in the test's import list.)

- [ ] **Step 2: RED** — `pnpm --filter @evenup/core test -- category` fails (symbols missing).

- [ ] **Step 3: Implement** in `category.ts`:

```ts
/** Curated icon names selectable for custom categories (clients map to SVG). */
export const CUSTOM_CATEGORY_ICONS: readonly string[] = [
  ...EXPENSE_CATEGORIES.map((c) => c.iconName),
  'dog', 'gift', 'coffee', 'dumbbell', 'music',
  'wrench', 'fuel', 'baby', 'gamepad-2', 'beer',
];

/** Group-scoped custom categories are referenced as `custom:<cuid>`. */
export function isCustomCategoryKey(key: string): boolean {
  return /^custom:[a-z0-9]+$/.test(key);
}
```

and change `summarizeByCategory`'s signature/body:

```ts
export function summarizeByCategory(
  transactions: readonly Categorizable[],
  opts?: { customKeys?: ReadonlySet<string> },
): CategorySummary[] {
  const customKeys = opts?.customKeys;
  // inside the loop, the key line becomes:
  const key =
    txn.category && (isExpenseCategory(txn.category) || customKeys?.has(txn.category))
      ? txn.category
      : 'other';
```

Export the two new symbols from `packages/core/src/index.ts` in the existing category export block.

- [ ] **Step 4: GREEN** — `pnpm --filter @evenup/core test && pnpm --filter @evenup/core lint && pnpm --filter @evenup/core typecheck`.

- [ ] **Step 5: Commit** — `feat(core): custom category keys, curated icon set, summarize customKeys opt`

---

### Task 2: DB — `GroupCategory` model + migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

**Interfaces:**
- Produces: `prisma.groupCategory` client model (`id`, `groupId`, `name`, `iconName`, `createdAt`; unique `(groupId, name)`), `Group.categories` relation.

- [ ] **Step 1:** Add the model from spec §2 verbatim after `model Member`'s block region, and `categories GroupCategory[]` inside `model Group`'s relation list.

- [ ] **Step 2:** `DATABASE_URL='postgresql://evenup:pass@localhost:55433/evenup' pnpm --filter @evenup/db exec prisma migrate dev --name group_category` → one migration with `CREATE TABLE "GroupCategory"` + unique index; then `pnpm --filter @evenup/db exec prisma generate` and `DATABASE_URL='postgresql://evenup:pass@localhost:55433/evenup_test' pnpm --filter @evenup/db exec prisma migrate deploy`.

- [ ] **Step 3:** `pnpm --filter @evenup/db typecheck && pnpm --filter @evenup/api typecheck` pass.

- [ ] **Step 4: Commit** — `feat(db): GroupCategory table for per-group custom categories`

---

### Task 3: API — category router, createExpense guard, stats wiring

**Files:**
- Create: `packages/api/src/routers/category.ts`
- Create: `packages/api/src/routers/category.test.ts`
- Modify: `packages/api/src/routers/index.ts` (or wherever the root router merges — grep `settlementRouter` to find it) to mount `category: categoryRouter`
- Modify: `packages/api/src/routers/transaction.ts` (createExpense custom-key guard)
- Modify: `packages/api/src/routers/stats.ts` (customKeys pass-through)

**Interfaces:**
- Consumes: Task 1 core exports; Task 2 model; existing `assertGroupAccess`, `logActivity`, harness.
- Produces: `category.list({groupId}) → {id,name,iconName}[]`; `category.create({groupId,name,iconName})`; `category.update({categoryId,name?,iconName?})`; `category.remove({categoryId})` (reassigns `custom:<id>` transactions to `'other'` in one tx); activity actions `category.created|updated|deleted` with `{name}` payloads.

- [ ] **Step 1: Failing tests** (`category.test.ts`, harness style):

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { makeCaller, createTestUser, testPrisma, resetDb } from '../test/harness.js';

async function groupFor(email: string) {
  const user = await createTestUser(email);
  const caller = makeCaller(user);
  const group = await caller.group.create({ name: 'Kat', template: 'TRIP', baseCurrency: 'CZK' });
  const member = await testPrisma.member.findFirstOrThrow({
    where: { groupId: group.id, userId: user.id },
  });
  return { user, caller, group, member };
}

describe('category router', () => {
  beforeEach(resetDb);

  it('creates, lists, updates; rejects duplicates and unknown icons', async () => {
    const { caller, group } = await groupFor('cat1@example.com');
    const created = await caller.category.create({
      groupId: group.id, name: 'Pivo', iconName: 'beer',
    });
    expect(created).toMatchObject({ name: 'Pivo', iconName: 'beer' });

    await expect(
      caller.category.create({ groupId: group.id, name: 'Pivo', iconName: 'coffee' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      caller.category.create({ groupId: group.id, name: 'X', iconName: 'not-an-icon' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    await caller.category.update({ categoryId: created.id, name: 'Pivko' });
    expect((await caller.category.list({ groupId: group.id }))[0]).toMatchObject({ name: 'Pivko' });
  });

  it('non-members cannot touch a group's categories', async () => {
    const { caller, group } = await groupFor('cat2@example.com');
    const created = await caller.category.create({
      groupId: group.id, name: 'Pivo', iconName: 'beer',
    });
    const stranger = makeCaller(await createTestUser('stranger@example.com'));
    await expect(stranger.category.list({ groupId: group.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(stranger.category.remove({ categoryId: created.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('remove reassigns the category's expenses to other in one transaction', async () => {
    const { caller, group, member } = await groupFor('cat3@example.com');
    const cat = await caller.category.create({
      groupId: group.id, name: 'Pivo', iconName: 'beer',
    });
    await caller.transaction.createExpense({
      groupId: group.id, title: 'Bečka', currency: 'CZK', category: `custom:${cat.id}`,
      date: new Date(),
      payers: [{ memberId: member.id, amountMinorUnits: 1000 }],
      split: { type: 'EQUAL', members: [{ memberId: member.id }] },
    });
    await caller.category.remove({ categoryId: cat.id });
    const tx = await testPrisma.transaction.findFirstOrThrow({ where: { groupId: group.id } });
    expect(tx.category).toBe('other');
    expect(await caller.category.list({ groupId: group.id })).toHaveLength(0);
  });

  it('createExpense rejects a custom key from another group; stats keep live customs', async () => {
    const a = await groupFor('cat4@example.com');
    const b = await groupFor('cat5@example.com');
    const foreign = await b.caller.category.create({
      groupId: b.group.id, name: 'Cizí', iconName: 'gift',
    });
    await expect(
      a.caller.transaction.createExpense({
        groupId: a.group.id, title: 'X', currency: 'CZK', category: `custom:${foreign.id}`,
        date: new Date(),
        payers: [{ memberId: a.member.id, amountMinorUnits: 100 }],
        split: { type: 'EQUAL', members: [{ memberId: a.member.id }] },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    const mine = await a.caller.category.create({
      groupId: a.group.id, name: 'Moje', iconName: 'coffee',
    });
    await a.caller.transaction.createExpense({
      groupId: a.group.id, title: 'Y', currency: 'CZK', category: `custom:${mine.id}`,
      date: new Date(),
      payers: [{ memberId: a.member.id, amountMinorUnits: 300 }],
      split: { type: 'EQUAL', members: [{ memberId: a.member.id }] },
    });
    const stats = await a.caller.stats.byCategory({ groupId: a.group.id });
    expect(stats.find((s) => s.category === `custom:${mine.id}`)?.totalMinorUnits).toBe(300);
  });
});
```

(Adapt `createExpense` input details to the actual schema if a field differs — read `schemas.ts`'s `createExpense` input first; keep assertions identical.)

- [ ] **Step 2: RED** — `DATABASE_URL='postgresql://evenup:pass@localhost:55433/evenup_test' pnpm --filter @evenup/api test -- category` fails (`category` router missing).

- [ ] **Step 3: Implement**

`category.ts` (mirror the member router's structure):

```ts
/** Per-group custom expense categories (spec 2026-07-09). */
import { z } from 'zod';
import { CUSTOM_CATEGORY_ICONS } from '@evenup/core';
import { TRPCError } from '@trpc/server';
import type { PrismaClient } from '@evenup/db';
import { router, protectedProcedure } from '../trpc.js';
import { assertGroupAccess } from '../access.js';
import { logActivity } from '../services/activity.js';

const nameInput = z.string().trim().min(1).max(40);
const iconInput = z.string().refine((v) => CUSTOM_CATEGORY_ICONS.includes(v), {
  message: 'Unknown icon',
});

async function groupIdForCategory(prisma: PrismaClient, categoryId: string) {
  const category = await prisma.groupCategory.findUnique({
    where: { id: categoryId },
    select: { groupId: true, name: true },
  });
  if (!category) throw new TRPCError({ code: 'NOT_FOUND', message: 'Category not found' });
  return category;
}

export const categoryRouter = router({
  list: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);
      return ctx.prisma.groupCategory.findMany({
        where: { groupId: input.groupId },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, iconName: true },
      });
    }),

  create: protectedProcedure
    .input(z.object({ groupId: z.string(), name: nameInput, iconName: iconInput }))
    .mutation(async ({ ctx, input }) => {
      await assertGroupAccess(ctx.prisma, ctx.user, input.groupId);
      const existing = await ctx.prisma.groupCategory.findUnique({
        where: { groupId_name: { groupId: input.groupId, name: input.name } },
      });
      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Category name already exists' });
      }
      const created = await ctx.prisma.groupCategory.create({
        data: { groupId: input.groupId, name: input.name, iconName: input.iconName },
        select: { id: true, name: true, iconName: true },
      });
      await logActivity(ctx.prisma, input.groupId, ctx.user.id, 'category.created', {
        name: created.name,
      });
      return created;
    }),

  update: protectedProcedure
    .input(z.object({ categoryId: z.string(), name: nameInput.optional(), iconName: iconInput.optional() }))
    .mutation(async ({ ctx, input }) => {
      const { groupId } = await groupIdForCategory(ctx.prisma, input.categoryId);
      await assertGroupAccess(ctx.prisma, ctx.user, groupId);
      const updated = await ctx.prisma.groupCategory.update({
        where: { id: input.categoryId },
        data: { name: input.name, iconName: input.iconName },
        select: { id: true, name: true, iconName: true },
      });
      await logActivity(ctx.prisma, groupId, ctx.user.id, 'category.updated', {
        name: updated.name,
      });
      return updated;
    }),

  remove: protectedProcedure
    .input(z.object({ categoryId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { groupId, name } = await groupIdForCategory(ctx.prisma, input.categoryId);
      await assertGroupAccess(ctx.prisma, ctx.user, groupId);
      await ctx.prisma.$transaction(async (tx) => {
        // Reassign, don't lose: the category's expenses land in built-in "other".
        await tx.transaction.updateMany({
          where: { groupId, category: `custom:${input.categoryId}` },
          data: { category: 'other' },
        });
        await tx.groupCategory.delete({ where: { id: input.categoryId } });
        await logActivity(tx, groupId, ctx.user.id, 'category.deleted', { name });
      });
      return { ok: true as const };
    }),
});
```

Handle Prisma's `P2002` on `update` name collisions the same way as `create` if the update test surfaces it (wrap in try/catch → CONFLICT) — add only if needed.

Mount it in the root router file next to the other routers (`category: categoryRouter`).

`transaction.ts` createExpense — after `assertGroupAccess`, add:

```ts
      if (input.category && isCustomCategoryKey(input.category)) {
        const exists = await ctx.prisma.groupCategory.findFirst({
          where: { id: input.category.slice('custom:'.length), groupId: input.groupId },
          select: { id: true },
        });
        if (!exists) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown category' });
        }
      }
```

(import `isCustomCategoryKey` from `@evenup/core`; verify `TRPCError` import exists.)

`stats.ts` — before summarize:

```ts
      const customs = await ctx.prisma.groupCategory.findMany({
        where: { groupId: input.groupId },
        select: { id: true },
      });
      const customKeys = new Set(customs.map((c) => `custom:${c.id}`));
      ...
      return summarizeByCategory(entries, { customKeys });
```

- [ ] **Step 4: GREEN** — focused, then full API suite + lint + typecheck (all with the test DATABASE_URL).

- [ ] **Step 5: Commit** — `feat(api): per-group custom categories — CRUD, expense guard, stats buckets`

---

### Task 4: Web — icons map, i18n keys, activity labels

**Files:**
- Modify: `apps/web/src/components/icons.tsx`
- Modify: `packages/i18n/src/locales/cs.ts`, `en.ts`
- Modify: `apps/web/src/lib/activity-message.ts`
- Modify: `apps/web/src/components/activity-feed.tsx` (ACTION_OPTIONS list)

**Interfaces:**
- Produces: `CategoryIcon` renders every `CUSTOM_CATEGORY_ICONS` name; i18n keys per spec §6; `describeActivity` handles `category.*`.

- [ ] **Step 1:** `icons.tsx` — add lucide imports `Dog, Gift, Coffee, Dumbbell, Music, Wrench, Fuel, Baby, Gamepad2, Beer` and extend `CATEGORY_ICONS`: `dog: Dog, gift: Gift, coffee: Coffee, dumbbell: Dumbbell, music: Music, wrench: Wrench, fuel: Fuel, baby: Baby, 'gamepad-2': Gamepad2, beer: Beer`.

- [ ] **Step 2:** i18n — cs:

```ts
  'group.categories': 'Kategorie',
  'category.custom.add': 'Přidat kategorii',
  'category.custom.name': 'Název kategorie',
  'category.custom.icon': 'Ikona',
  'category.custom.deleteConfirm':
    'Opravdu smazat kategorii? Její výdaje se přesunou do „Ostatní".',
  'category.custom.duplicate': 'Kategorie s tímto názvem už existuje.',
  'category.custom.empty': 'Zatím žádné vlastní kategorie.',
  'activityType.category.created': 'Kategorie vytvořena',
  'activityType.category.updated': 'Kategorie upravena',
  'activityType.category.deleted': 'Kategorie smazána',
```

en mirrors: `'Categories'`, `'Add category'`, `'Category name'`, `'Icon'`, `'Really delete the category? Its expenses move to "Other".'`, `'A category with this name already exists.'`, `'No custom categories yet.'`, `'Category created'`, `'Category updated'`, `'Category deleted'`.

- [ ] **Step 3:** `activity-message.ts` — extend the switch:

```ts
    case 'category.created':
      return t('activity.created', { actor, item: str(p.name) });
    case 'category.deleted':
      return t('activity.deleted', { actor, item: str(p.name) });
    case 'category.updated':
```

(`category.updated` joins the existing `activity.edited` fall-through group.)

`activity-feed.tsx` — append `'category.created', 'category.updated', 'category.deleted'` to `ACTION_OPTIONS`.

- [ ] **Step 4:** `pnpm --filter @evenup/i18n test && pnpm --filter @evenup/web lint && pnpm --filter @evenup/web typecheck` pass. Commit — `feat(web): category icons, i18n, activity labels for custom categories`

---

### Task 5: Web — management sheet + expense grid + stats labels

**Files:**
- Create: `apps/web/src/components/category-manager.tsx`
- Modify: `apps/web/src/components/group-detail.tsx` (menu item `categories` after `stats`, panel Sheet, `category.list` query, pass customs to `AddExpenseForm` and `SpendStats`)
- Modify: `apps/web/src/components/add-expense-form.tsx` (grid shows customs; `customCategories` prop)
- Modify: `apps/web/src/components/spend-stats.tsx` (`customCategories` prop for labels/icons)

**Interfaces:**
- Consumes: `category` router (Task 3), icons/i18n (Task 4), kit components, `CUSTOM_CATEGORY_ICONS` from core.
- Produces testids for Task 6: `menu-categories`, `category-name-input`, `category-icon-<iconName>`, `category-add-btn`, `category-row-<id>`, `category-delete-<id>`, `category-rename-<id>`, plus grid tile `category-chip-custom:<id>` (the existing `category-chip-${key}` pattern applied to the custom key).

- [ ] **Step 1:** `category-manager.tsx` — self-contained sheet content:

```tsx
'use client';
import { useState } from 'react';
import { CUSTOM_CATEGORY_ICONS } from '@evenup/core';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Button, EmptyState, Input, Label, iconButtonClass } from '@/components/ui';
import { CategoryIcon, Check, Pencil, Trash2, X } from '@/components/icons';

/** Manage a group's custom categories (list + add + rename + delete). */
export function CategoryManager({ groupId }: { groupId: string }) {
  const { t } = useI18n();
  const utils = trpc.useUtils();
  const list = trpc.category.list.useQuery({ groupId });
  const invalidate = () => {
    void utils.category.list.invalidate({ groupId });
    void utils.activity.list.invalidate({ groupId });
  };
  const create = trpc.category.create.useMutation({
    onSuccess: () => {
      setName('');
      setIconName(CUSTOM_CATEGORY_ICONS[0]!);
      setError(null);
      invalidate();
    },
    onError: (e) =>
      setError(e.data?.code === 'CONFLICT' ? t('category.custom.duplicate') : e.message),
  });
  const update = trpc.category.update.useMutation({
    onSuccess: () => {
      setEditingId(null);
      invalidate();
    },
  });
  const remove = trpc.category.remove.useMutation({
    onSuccess: () => {
      invalidate();
      void utils.stats.byCategory.invalidate({ groupId });
    },
  });

  const [name, setName] = useState('');
  const [iconName, setIconName] = useState(CUSTOM_CATEGORY_ICONS[0]!);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const iconGrid = (selected: string, onPick: (icon: string) => void) => (
    <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label={t('category.custom.icon')}>
      {CUSTOM_CATEGORY_ICONS.map((icon) => (
        <button
          key={icon}
          type="button"
          role="radio"
          aria-checked={selected === icon}
          aria-label={icon}
          onClick={() => onPick(icon)}
          data-testid={`category-icon-${icon}`}
          className={`flex items-center justify-center rounded-xl border p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
            selected === icon
              ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-600/20 dark:text-brand-100'
              : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
          }`}
        >
          <CategoryIcon name={icon} size={18} />
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      {list.data && list.data.length > 0 ? (
        <ul className="space-y-1">
          {list.data.map((c) => (
            <li key={c.id} className="flex items-center gap-2 py-1" data-testid={`category-row-${c.id}`}>
              <span className="text-zinc-600 dark:text-zinc-300">
                <CategoryIcon name={c.iconName} size={18} />
              </span>
              {editingId === c.id ? (
                <>
                  <Input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    aria-label={t('category.custom.name')}
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => draft.trim() && update.mutate({ categoryId: c.id, name: draft.trim() })}
                    aria-label={t('common.save')}
                    className={iconButtonClass}
                  >
                    <Check size={16} aria-hidden />
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} aria-label={t('common.cancel')} className={iconButtonClass}>
                    <X size={16} aria-hidden />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 truncate text-sm">{c.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(c.id);
                      setDraft(c.name);
                    }}
                    aria-label={`${t('common.edit')} — ${c.name}`}
                    data-testid={`category-rename-${c.id}`}
                    className={iconButtonClass}
                  >
                    <Pencil size={16} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(t('category.custom.deleteConfirm'))) {
                        remove.mutate({ categoryId: c.id });
                      }
                    }}
                    aria-label={`${t('common.delete')} — ${c.name}`}
                    data-testid={`category-delete-${c.id}`}
                    className={iconButtonClass}
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={t('category.custom.empty')} />
      )}

      <form
        className="space-y-3 border-t border-zinc-100 pt-4 dark:border-zinc-800"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate({ groupId, name: name.trim(), iconName });
        }}
      >
        <div>
          <Label htmlFor="cat-name">{t('category.custom.name')}</Label>
          <Input
            id="cat-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="category-name-input"
          />
        </div>
        {iconGrid(iconName, setIconName)}
        {error ? (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={create.isPending} data-testid="category-add-btn">
          {create.isPending ? t('common.loading') : t('category.custom.add')}
        </Button>
      </form>
    </div>
  );
}
```

(Check `Trash2` is exported from `icons.tsx` — it is per its export list.)

- [ ] **Step 2:** `group-detail.tsx` — add `'categories'` to the `Panel` union; menu item `{ key: 'categories', icon: Tags, label: t('group.categories'), onSelect: () => openPanel('categories') }` after `stats` (import `Tags` — add `Tags` to `icons.tsx` lucide re-exports); render:

```tsx
      <Sheet open={panel === 'categories'} onClose={() => setPanel(null)} title={t('group.categories')}>
        <CategoryManager groupId={groupId} />
      </Sheet>
```

Add one query `const customCategories = trpc.category.list.useQuery({ groupId });` and pass `customCategories={customCategories.data ?? []}` to BOTH `<AddExpenseForm …/>` and `<SpendStats …/>`.

- [ ] **Step 3:** `add-expense-form.tsx` — new prop `customCategories: { id: string; name: string; iconName: string }[]`; in the category `DisclosureRow`:
  - the grid maps `EXPENSE_CATEGORIES` as today, then appends custom tiles with `key={`custom:${c.id}`}`, label `c.name` (no i18n), icon `<CategoryIcon name={c.iconName} size={20} />`, `data-testid={`category-chip-custom:${c.id}`}`, same selected/idle classes, `onClick={() => setCategory(`custom:${c.id}`)}`.
  - the row's `value` label: if `category` starts with `custom:`, show the matching custom's name + icon (fallback to the "other" icon/label if the custom was deleted meanwhile); else the existing `t('category.<key>')` path. Reset logic keeps default `'other'` untouched.

- [ ] **Step 4:** `spend-stats.tsx` — new prop `customCategories: { id: string; name: string; iconName: string }[]`; row label/icon resolution:

```tsx
const custom = s.category.startsWith('custom:')
  ? customCategories.find((c) => `custom:${c.id}` === s.category)
  : undefined;
// label: custom?.name ?? t(`category.${s.category}` as MessageKey) — but for a
// dangling custom key (already folded server-side, shouldn't appear) fall back
// to t('category.other'). Icon: custom ? custom.iconName : categoryIcon(s.category).
```

- [ ] **Step 5:** `pnpm --filter @evenup/web lint && pnpm --filter @evenup/web typecheck` pass. Commit — `feat(web): custom category management sheet, expense grid tiles, stats labels`

---

### Task 6: E2E coverage

**Files:**
- Modify: `apps/web/e2e/critical-flow.spec.ts`

**Interfaces:**
- Consumes: testids from Task 5; helpers `signIn`, `uniqueEmail`, `openGroupSheet`, `closeSheet`.

- [ ] **Step 1:** Append inside the describe block:

```ts
  test('custom categories: create, use in expense, see in stats, delete folds to Other', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail('cats', testInfo.workerIndex + Date.now());
    await signIn(page, email);

    await page.getByTestId('new-group-btn').click();
    await page.getByTestId('group-name-input').fill('Kategorie');
    await page.getByTestId('create-group-submit').click();
    await page.getByText('Kategorie').click();

    // Create the category (axe-check the open sheet too).
    await openGroupSheet(page, 'categories');
    const sheetA11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(sheetA11y.violations, JSON.stringify(sheetA11y.violations, null, 2)).toEqual([]);
    await page.getByTestId('category-name-input').fill('Pivo');
    await page.getByTestId('category-icon-beer').click();
    await page.getByTestId('category-add-btn').click();
    await expect(page.getByText('Pivo')).toBeVisible();
    await closeSheet(page);

    // Use it in an expense via the grid.
    await page.getByTestId('add-expense-open').click();
    await page.getByTestId('expense-amount-input').fill('240');
    await page.getByTestId('expense-title-input').fill('Bečka');
    await page.getByTestId('expense-category-row').click();
    await page.getByTestId(/^category-chip-custom:/).click();
    await page.getByTestId('add-expense-submit').click();

    // Stats show the custom name.
    await openGroupSheet(page, 'stats');
    await expect(page.getByTestId('spend-stats').getByText('Pivo')).toBeVisible();
    await closeSheet(page);

    // Delete → the amount folds into the built-in Other bucket.
    await openGroupSheet(page, 'categories');
    page.once('dialog', (d) => void d.accept());
    await page.getByTestId(/^category-delete-/).click();
    await expect(page.getByTestId(/^category-row-/)).toHaveCount(0);
    await closeSheet(page);

    await openGroupSheet(page, 'stats');
    await expect(page.getByTestId('spend-stats').getByText(/Ostatní|Other/)).toBeVisible();
    await expect(page.getByTestId('spend-stats').getByText('Pivo')).toHaveCount(0);
  });
```

(`getByTestId` accepts a RegExp; `window.confirm` is auto-accepted via the one-shot dialog handler registered BEFORE the click.)

- [ ] **Step 2:** RED (only the new test fails — missing testids would mean Task 5 gaps), then GREEN: full chromium suite via the wrapper — expect 18/18. Lint+typecheck.

- [ ] **Step 3:** Commit — `test(web): e2e for custom category lifecycle`

---

### Task 7: Full verification pass

- [ ] **Step 1:** `pnpm --filter @evenup/core test && lint && typecheck`; `@evenup/api` test (with test DATABASE_URL) + lint + typecheck; `@evenup/i18n test`; `@evenup/web` lint + typecheck + test; full chromium AND webkit e2e via the wrapper. Fix fallout where it occurs (never weaken assertions/axe).
- [ ] **Step 2:** Commit any fixes — `test: custom-categories verification fallout` (skip if clean).
