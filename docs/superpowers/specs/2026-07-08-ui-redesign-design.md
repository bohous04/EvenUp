# Web UI redesign — light-minimal, Settle Up-inspired (design spec)

> **Status:** approved design, ready to implement
> **Date:** 2026-07-08
> **Scope owner:** `apps/web` (all screens), `packages/i18n`
> **Related:** [`docs/PRD.md`](../../PRD.md) §9 (UX/a11y) · supersedes the *visual* layer of
> [`2026-07-08-add-expense-redesign-design.md`](2026-07-08-add-expense-redesign-design.md) (its modal
> architecture and unchanged-payload rule carry over) · mobile Expo app is a later, separate project.

## 1. Context & goal

The web app works but looks like an unstyled developer tool: generic blue Tailwind,
every feature (members, expense form, OCR, CSV, bank details, stats, activity,
transactions) stacked on one page with no hierarchy. The user wants the *structure*
of Settle Up (hero balances, debts, transaction list, FAB, focused expense entry)
with a **modern, light-first, minimalistic** identity — explicitly *not* Settle Up's
dark wine/pink look.

Approved via interactive mockups (visual companion, 2026-07-08):

- **Scope:** whole web app in one design pass. Mobile Expo app later.
- **Identity:** light-first minimal, **indigo accent**; dark mode kept but secondary.
- **Group screen:** settle-up card leads → balance bars → recent transactions → FAB.
  Secondary features move behind a `⋯` group menu.
- **Expense entry:** FAB opens **one scrollable sheet, amount first** (no wizard).
- **Component strategy:** grow our own kit, pure Tailwind, **no new dependencies**.

## 2. Design tokens (`apps/web/src/app/globals.css`)

Replace the blue `brand` scale with indigo and add semantic tokens. Light is the
designed-first theme; dark mirrors it via `prefers-color-scheme` as today.

| Token | Light | Dark |
| --- | --- | --- |
| `--color-brand-*` | Tailwind indigo scale; primary `#4f46e5` (600), hover `#4338ca` (700), tint bg `#eef2ff` (50) | same hues, tint bg `indigo-950` |
| Page background | `#fafafa` (zinc-50) | `#09090b` (zinc-950) |
| Card surface | `#ffffff` | `#18181b` (zinc-900) |
| Hairline border | `#ececee` (~zinc-200) | `#27272a` (zinc-800) |
| Text | `#18181b` (zinc-900) | `#f4f4f5` |
| Muted text | `#a1a1aa` (zinc-400) | `#71717a` |
| Positive amount | `green-600` | `green-400` |
| Negative amount | `red-600` | `red-400` |

- **Radii:** cards `rounded-2xl` (16px), inputs/buttons `rounded-xl` (12px), chips/pills `rounded-full`.
- **Shadows:** none on cards (hairline borders instead); soft indigo shadow only on the FAB.
- **Typography:** system stack (unchanged); page titles `font-extrabold tracking-tight`;
  section labels are small uppercase muted (`text-[11px] uppercase tracking-widest`).
- **Amounts:** always `tabular-nums`, colored by sign, and **never wrap** — rendered
  with non-breaking spaces and `whitespace-nowrap` (hard rule; validated in mockups
  where wrapping broke the layout).

## 3. Component kit (`apps/web/src/components/`)

Extend the existing kit; everything is Tailwind + native elements, no new deps.

| Component | File | Notes |
| --- | --- | --- |
| `Sheet` | `sheet.tsx` (new) | Wraps the existing native-`<dialog>` `Modal` mechanics. `< sm` breakpoint: bottom sheet (pinned bottom, `rounded-t-2xl`, grab handle, `max-h-[92dvh]`, scrollable body); `≥ sm`: centered dialog. Focus trap / Escape / backdrop-close come free from `showModal()`. `Modal` stays for callers not yet migrated; end state is every dialog on `Sheet`. |
| `Fab` | `fab.tsx` (new) | Fixed bottom-right circular button, indigo, `lucide` `Plus`, ≥ 56px touch target, `shadow-[indigo]`. Respects safe-area insets (PWA). |
| `Avatar` | `member-chip.tsx` (extend) | Existing `MemberChip` is the base: colored circle + initials; add sizes (`xs 18px / sm 24px / md 32px`) and an overlapping `AvatarStack`. |
| `AmountText` | `ui.tsx` | Formats via existing `formatCurrency`, applies tabular-nums + sign color + nowrap + NBSP. Single place enforcing the no-wrap rule. |
| `SectionLabel`, `ListRow`, `EmptyState` | `ui.tsx` | Uppercase card label; icon/avatar + title/subtitle + trailing amount row (used by transactions, debts, menu items); friendly empty state with icon. |
| `MenuSheet` | `menu-sheet.tsx` (new) | The `⋯` menu: a `Sheet` of `ListRow` items (icon + label + chevron). Simpler and more touch-friendly than a hover dropdown; one component serves mobile + desktop. |

Icons: `lucide-react` SVG components only via `icons.tsx` — **never emoji glyphs**
(standing user rule). New re-exports needed: `MoreHorizontal, Settings, Users,
BarChart3, History, FileUp, Landmark, QrCode, ChevronRight, ChevronLeft, X, Calendar`.

## 4. Screens

### 4.1 Group detail (`group-detail.tsx`) — the core restructure

Page shows **only** (in order):

1. **Header** — `‹ Groups` back link, group name (`text-2xl font-extrabold`), meta line
   `„4 members · 11 600 Kč spent“` (count from members; total from the existing spend
   stats query), `⋯` icon button opening the group `MenuSheet`.
2. **Settle up card** — the minimal debt list from the debt-minimization engine
   (already computed by `BalancesPanel`). Each row: payer avatar+name `→` payee
   avatar+name, indigo amount, chevron. **The whole row is the tap target** (no
   separate button — validated in mockups); it opens a **settle sheet**: payment
   summary, SPAYD QR (existing `qr-code.tsx`), and a „Mark as settled“ action
   (existing transfer mutation). Card hidden when everyone is settled → replaced by
   an `EmptyState` („All settled up ✓“ with check icon).
3. **Balances card** — one row per active member: avatar + name, a horizontal bar
   diverging from a center line (green right = is owed, red left = owes, bar length
   proportional to `|balance| / max|balance|`), `AmountText` right-aligned. Plain
   divs, no chart lib.
4. **Transactions card** — the **5 most recent**: payer avatar, title, subtitle
   („Michal paid · date“ / „Ondra → Michal · date“ for transfers), amount; receipt
   link kept as small icon. „Show all“ expands the full list in place (client-side,
   list is already fully fetched).
5. **FAB** — opens the expense sheet (§4.2).

Everything else moves into the **`⋯` MenuSheet**: Members (rename/add — existing
forms in a sheet), Invite link (existing mutation; moves out of the header),
Statistics (`SpendStats` in a sheet), Activity (`ActivityFeed` in a sheet), CSV
import, Bank details, each as its own sheet reusing the existing components
unchanged in logic. Order: Members, Invite, Statistics, Activity, CSV import, Bank
details.

### 4.2 Expense sheet (`add-expense-form.tsx` reshape)

The trigger `Card`+button is replaced by the FAB; the existing `Modal` becomes a
`Sheet`. Same rule as the prior spec: **UI reshape only — the submit payload, FX
handling, split-type math, and recurrence logic are unchanged.** New layout, top to
bottom:

1. **Amount** — large centered input (`text-4xl font-extrabold tabular-nums`),
   autofocused, `inputmode="decimal"`, currency suffix (existing currency select as
   a compact inline control).
2. **Title** — borderless centered input, placeholder „What was it for?“ (existing
   i18n key).
3. **Paid by** — member chips (avatar + name pills, single-select; existing
   multi-payer support stays reachable via „více plátců“ toggle as today).
4. **For whom** — member chips, multi-select, each selected chip shows its computed
   share; equal split recomputes live (existing logic).
5. **Collapsed rows** (progressive disclosure, replaces „Více možností“): `Split`
   (Equally ▾ → existing split-type controls expand), `Date`, `Category` (existing
   icon-grid picker), `Repeat`, `Receipt` (`Camera` icon → existing OCR flow moves
   *inside* the sheet; the standalone `OcrScan` card disappears from the page).
6. **Save** — full-width indigo button pinned at sheet bottom.

### 4.3 Groups dashboard (`groups-dashboard.tsx`)

- Header: **Even<span indigo>Up</span>** wordmark + `Settings` gear icon-button → `/settings`.
- Group cards: name, meta („10 transactions · CZK“), trailing `AvatarStack` (max 5,
  `+N` overflow badge). Whole card links to the group (unchanged).
- „New group“ button is replaced by a **FAB** opening a create-group `Sheet`
  (existing name/template/currency form restyled).
- Empty state: `EmptyState` with a „Create your first group“ action.

### 4.4 Sign-in (`sign-in.tsx`)

Shell restyle only — auth logic untouched (magic link today; the email+password
sub-project changes fields later, not the shell). Centered wordmark + tagline, one
card, indigo primary button. **OAuth buttons get official brand-logo SVGs** (Google
multicolor „G“, Apple mark) added to `icons.tsx` as inline SVG components —
`lucide-react` has no brand logos.

### 4.5 Settings, admin, invite pages

Token-level restyle only (colors/radii/labels via the shared kit); no structural
changes. Admin keeps its table layout.

## 5. Error handling & states

Behavior unchanged; presentation via the kit: loading = existing text swapped for a
muted centered line (no skeleton system in this pass); errors = existing `role=
"alert"` messages restyled red-600 on red-50 tint; destructive actions keep their
current confirms.

## 6. Accessibility

Preserved from PRD §9.4: WCAG 2.1 AA contrast (indigo-600 on white passes AA for
text ≥ 12px bold; muted text used only for secondary info), native-`<dialog>` focus
management, `prefers-reduced-motion` guard stays global, FAB ≥ 56px and safe-area
aware, settle rows and menu rows are real `<button>`s with full-row hit areas,
uppercase labels keep readable letter-spacing.

## 7. i18n

Existing keys are reused: `balance.suggestedPayments` (settle-up card),
`balance.settledUp`, `settle.title`, `settle.markPaid`, plus all form/menu-item
labels that already exist. New keys (CZ + EN) in `packages/i18n`: `group.menu`
(+ one per menu item where no key exists), `group.balances`, `common.showAll`.
All mockup copy is placeholder — final strings follow existing catalog tone
(CZ default).

## 8. Testing

- `apps/web/e2e/critical-flow.spec.ts` updates: expense entry now goes FAB →
  sheet (`add-expense-open` testid moves to the FAB); member add/invite/stats flows
  navigate via the `⋯` menu (`group-menu` testid + one per item). Existing testids
  are preserved wherever the element survives (`group-title`, `transactions-list`,
  `create-group-submit`, …).
- New testids: `group-menu`, `settle-row`, `settle-sheet`, `fab-add-expense`,
  `fab-add-group`.
- Visual sanity: light + dark manual pass on iPhone-width viewport (390px) and
  desktop; amount-wrapping regression check with 7-digit amounts.

## 9. Out of scope

- `apps/mobile` (Expo) — follows later as its own design+plan using these tokens.
- Any API/schema/auth changes; any split-math or FX changes.
- Skeleton loaders, animations/transitions system, marketing/landing page.

## 10. Implementation order (for the plan)

1. Tokens + kit (`globals.css`, `ui.tsx`, `Sheet`, `Fab`, `Avatar`, `MenuSheet`, icons).
2. Group detail restructure (settle card, balances bars, transactions, menu).
3. Expense sheet reshape.
4. Dashboard + create-group sheet.
5. Sign-in + settings/admin/invite restyle.
6. e2e updates + a11y/visual pass.
