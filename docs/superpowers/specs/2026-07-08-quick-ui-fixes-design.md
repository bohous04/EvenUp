# Quick UI fixes — member rename + expense-form gap (design spec)

> **Status:** approved design, ready to implement
> **Date:** 2026-07-08
> **Scope owner:** `apps/web` (`group-detail.tsx`, `add-expense-form.tsx`, `icons.tsx`), `packages/i18n`
> **Related:** [`docs/PRD.md`](../../PRD.md) FR-2.x (members) · first of three workstreams (this · add-expense redesign · admin dashboard + VIP)

## 1. Context & goal

Two small, low-risk UI improvements requested from screenshots of the group
detail page. No schema changes, no new API. Both are frontend-only and reuse
existing tRPC mutations and i18n keys.

Verified current state (2026-07-08):

- **Member rename:** `member.update({ memberId, displayName })`
  (`packages/api/src/routers/member.ts:51`) already exists, re-derives initials,
  and logs a `member.updated` activity. The web UI exposes **no** way to call it —
  `group-detail.tsx:72-83` renders members as a static chip wrap.
- **Expense-form gap:** `add-expense-form.tsx` lays the form out in a
  `space-y-3` stack; the submit `Button` (line ~365) sits directly under the
  split-between chips / per-member inputs with only the 0.75rem stack gap.
- Icons come from `lucide-react` via `apps/web/src/components/icons.tsx`; only a
  fixed set is re-exported today (`Scale, Mail, Camera, Check, ArrowRight,
Trash2, Plus`). Per the user's standing rule, use SVG icon components, never
  emoji.
- i18n keys already present: `common.save`, `common.cancel`, `common.edit`,
  `member.name`.

## 2. Fix 1 — Inline member rename

**Where:** the "Členové / Members" card in `group-detail.tsx`.

**Layout change:** replace the horizontal chip _wrap_ with a vertical list of
member rows so an edit affordance has room. Each active member renders one row:

```
(MI) misalenert                         ✎     ← edit button, aria-label = common.edit
(DA) David                              ✎
```

- The pencil is a real `<button>` (not a chip), keyboard-focusable, with
  `aria-label={t('common.edit')}` and `title`. It uses the `Pencil` lucide icon.
- The existing `AddMemberForm` stays below the list, unchanged.

**Edit state:** clicking the pencil puts _that one row_ into edit mode (local
`editingId` state in `group-detail.tsx`). The row becomes:

```
(MI) [ misalenert…………… ]  ✓  ✕     ← Input prefilled with current name + Save + Cancel
```

- Uses the shared `Input` and `Button` primitives. To keep the row compact, the
  Save and Cancel controls are **icon-only** buttons: Save = `Check` icon with
  `aria-label={t('common.save')}`; Cancel = `X` icon with
  `aria-label={t('common.cancel')}`.
- **Enter** submits, **Escape** cancels. Cancel restores the original name and
  exits edit mode without a network call.
- Empty / whitespace-only names are rejected client-side (Save disabled); the
  server also enforces `min(1).max(80)`.
- On submit: call `member.update({ memberId, displayName: trimmed })`. On
  success, exit edit mode and invalidate `group.get` and `activity.list`
  (same invalidation pattern as `add-member-form.tsx`). While pending, disable
  Save and show the existing loading affordance.
- Only **one** row is editable at a time; opening another closes the first.

**Icons:** add `Pencil` and `X` to the `icons.tsx` re-export.

**i18n:** no new keys required (reuse `common.edit` / `common.save` /
`common.cancel`). An optional `member.rename` key may be added for a clearer
edit-button label; not required for v1.

**Out of scope:** deleting/deactivating members (a `member.remove` mutation
exists but the request was only about renaming — YAGNI).

## 3. Fix 2 — Bigger gap before "Uložit"

**Where:** the submit button in `add-expense-form.tsx`.

Wrap the submit `Button` in a container that adds a subtle divider plus spacing
so Save reads as a distinct final action (user chose divider + gap over plain
whitespace):

```
…(split-between chips / per-member inputs)…
────────────────────────────────────────────   ← border-t divider
[ Uložit ]
```

Classes: `mt-4 pt-4 border-t border-neutral-100 dark:border-neutral-800` on the
submit wrapper. Purely presentational; no behavior change.

## 4. Testing

- **E2E (`apps/web/e2e`):** extend the group flow — rename a member via the
  pencil, assert the displayed name and chip initials update; assert Escape
  cancels without change. The repo already drives group/member flows in
  Playwright.
- **No unit tests needed** for the gap (CSS-only).
- Manual: verify rename is keyboard-operable (Tab to pencil, Enter to edit,
  type, Enter to save, Escape to cancel) and works in both `cs` and `en`.

## 5. Risks

Low. No schema/API/auth changes. The only structural change is the members card
going from a chip wrap to a row list; keep the small chip + name styling so the
visual weight is unchanged.
