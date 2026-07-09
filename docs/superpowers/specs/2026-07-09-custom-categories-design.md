# Custom expense categories per group (design spec)

> **Status:** approved design, ready to implement
> **Date:** 2026-07-09
> **Scope owner:** `packages/db`, `packages/core`, `packages/api`, `packages/i18n`, `apps/web`
> **Related:** [`docs/PRD.md`](../../PRD.md) FR-12.2 (categories/stats) · builds on the 2026-07-08 redesign (group `⋯` menu, expense sheet).

## 1. Context & goal

Groups want their own expense categories ("Benzín karavan", "Pivo") alongside
the ten built-ins. Approved decisions (2026-07-09): categories are **per
group** (visible to all members), have a **name + an icon picked from a
curated set**, are **managed from the group `⋯` menu** (any member), and
**deleting a used category reassigns its expenses to the built-in "other"** so
nothing is lost.

## 2. Data model (`packages/db`)

```prisma
model GroupCategory {
  id        String   @id @default(cuid())
  groupId   String
  group     Group    @relation(fields: [groupId], references: [id], onDelete: Cascade)
  name      String
  iconName  String // semantic lucide kebab-case name from core's CUSTOM_CATEGORY_ICONS
  createdAt DateTime @default(now())

  @@unique([groupId, name])
}
```

`Group` gains the back-relation `categories GroupCategory[]`. One additive
migration.

`Transaction.category` stays a plain string: built-ins keep their keys
(`groceries`, …); custom categories are referenced as **`custom:<id>`**. No
change to existing rows.

## 3. Core (`packages/core`)

- `CUSTOM_CATEGORY_ICONS: readonly string[]` — curated icon-name set for
  custom categories (~20 lucide kebab-case names distinct in style from each
  other; includes the built-ins' ten plus e.g. `dog`, `gift`, `coffee`,
  `dumbbell`, `music`, `wrench`, `fuel`, `baby`, `gamepad-2`, `beer`). Core
  stores names only, never emoji (standing rule).
- `isCustomCategoryKey(key: string): boolean` — `/^custom:[a-z0-9]+$/`.
- `summarizeByCategory(transactions, opts?: { customKeys?: ReadonlySet<string> })`
  — TODAY it folds every non-built-in key into `other`; custom keys present in
  `opts.customKeys` must survive as their own buckets. Unknown/dangling keys
  still fold into `other`. Existing call sites without opts behave exactly as
  before (unit-tested).

## 4. API (`packages/api`)

New `category` router (all procedures behind `assertGroupAccess`):

- `list({ groupId })` → `{ id, name, iconName }[]` ordered by `createdAt`.
- `create({ groupId, name: 1..40 trimmed, iconName })` — `iconName` must be in
  `CUSTOM_CATEGORY_ICONS`; duplicate name in the group → `CONFLICT` (friendly
  message). Logs activity `category.created` with `{ name }`.
- `update({ categoryId, name?, iconName? })` — same validations; logs
  `category.updated`.
- `remove({ categoryId })` — in one transaction: `updateMany` all the group's
  transactions with `category = 'custom:<id>'` to `'other'`, delete the row,
  log `category.deleted` with `{ name }`.

`transaction.createExpense` (and the CSV import path if it accepts category
strings): when `input.category` matches `custom:*`, verify the id exists in
**this** group, else `BAD_REQUEST`. Built-in keys and absent category behave
as today.

`stats.byCategory`: fetch the group's custom category ids and pass
`customKeys` to `summarizeByCategory`; response shape unchanged (category key
strings, including `custom:<id>` buckets).

Activity: three new action strings (`category.created|updated|deleted`) with
`activityType.*` i18n labels and `describeActivity` handling mirroring the
member actions (`{ name }` payload).

## 5. Web UI (`apps/web`)

### Group `⋯` menu → new item "Kategorie" (after Statistics)

Sheet `menu-categories` → panel listing the group's custom categories:
- Row: icon + name, pencil (inline rename + icon change), trash. Delete asks
  for confirmation (`window.confirm`) with copy explaining expenses move to
  "Ostatní".
- Add form: name input + icon grid (the curated set, same tile style as the
  expense sheet's category grid), submit button.
- Empty state via `EmptyState`.

### Expense sheet category grid

The grid shows built-ins (translated labels, as today) followed by the
group's custom categories (own name + icon). Selecting stores
`custom:<id>` in the existing `category` state; submit payload otherwise
unchanged. `AddExpenseForm` gains a `customCategories: {id,name,iconName}[]`
prop supplied by `group-detail.tsx` (one `category.list` query there).

### Stats sheet (`spend-stats.tsx`)

Rows resolve labels: built-in → `t('category.<key>')`; `custom:<id>` → name
from the group's custom list (prop or its own `category.list` query —
implementer picks the simpler consistent option); icon via the category's
`iconName`. Dangling keys (already folded server-side) render as "other".

### Icon rendering

`icons.tsx`'s `CATEGORY_ICONS` map extends to cover every name in
`CUSTOM_CATEGORY_ICONS` (lucide imports; fallback `Package` stays).

## 6. i18n (cs + en)

`group.categories` ("Kategorie"/"Categories"), `category.custom.add`,
`category.custom.name`, `category.custom.icon`, `category.custom.deleteConfirm`
("Výdaje kategorie se přesunou do Ostatní…"), `category.custom.duplicate`,
`activityType.category.created|updated|deleted`, and `activity.*` describe
strings mirroring the member.updated pattern. Czech uses vykání (catalog
tone).

## 7. Testing

- **core**: `summarizeByCategory` with/without `customKeys` (survival,
  dangling→other, no-opts backward compat); `isCustomCategoryKey`.
- **api** (harness): category CRUD + access control (non-member →
  FORBIDDEN), duplicate name → CONFLICT, remove reassigns transactions to
  `other`, createExpense rejects a foreign group's `custom:*` key,
  stats.byCategory returns custom buckets.
- **e2e** (chromium): create category via menu → appears in the expense grid
  → create expense with it → stats show the custom name → delete category →
  stats show the amount under "Ostatní". Axe check on the open categories
  sheet.

## 8. Out of scope

Colors, ordering/drag-and-drop, per-user categories, mobile app UI (API is
ready for it), migrating built-ins, editing a transaction's category.
