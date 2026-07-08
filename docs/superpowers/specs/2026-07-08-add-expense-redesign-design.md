# Add-expense redesign — modal + progressive disclosure (design spec)

> **Status:** approved design, ready to implement
> **Date:** 2026-07-08
> **Scope owner:** `apps/web` (`add-expense-form.tsx`, new `modal.tsx`, `group-detail.tsx`, `e2e`), `packages/i18n`
> **Related:** [`docs/PRD.md`](../../PRD.md) FR-3.x (expenses), §9.4 (a11y) · second of three workstreams (quick UI fixes ✓ · this · admin dashboard + VIP)

## 1. Context & goal

The "Přidat výdaj" form shows every input at once (title, amount, currency+FX,
paid-by, category, split-type, recurrence, member chips, per-member inputs) —
too dense (user feedback, Image #11). Reshape it into a **prominent trigger
button → focused modal** with **progressive disclosure** and **tactile "nice
buttons"** instead of dropdowns. This is a **UI reshape only**: the submit
payload, FX handling, split-type math, and recurrence logic are unchanged.

Approved decisions:

- **Surface:** modal dialog over a dimmed page.
- **Structure:** progressive disclosure — essentials always visible, advanced
  behind a "Více možností" toggle.
- **Category control:** tappable **icon-grid** picker (icons already exist via
  `CategoryIcon` + `EXPENSE_CATEGORIES[].iconName`).

## 2. Architecture

### 2.1 New `Modal` component (`apps/web/src/components/modal.tsx`)

Accessible dialog built on the **native `<dialog>` element** — **no new
dependency** (project is deliberately minimal-dep). Props: `open: boolean`,
`onClose: () => void`, `title: string`, `children`, optional `testId`.

- A `ref` to the `<dialog>`; a `useEffect` calls `el.showModal()` when `open`
  goes true and `el.close()` when false. `showModal()` gives focus-trapping,
  top-layer stacking, `::backdrop`, and focus-return-to-trigger for free.
- Listen for the dialog's native `cancel` event (Escape) and `close` event →
  call `onClose` (guarded so we don't loop).
- Backdrop click: an `onClick` on the dialog closes when `e.target === dialogEl`
  (the backdrop is the dialog element itself; inner content stops propagation).
- Header: `<h2 id>` title wired via `aria-labelledby`, plus a close (`X`) icon
  button labelled `t('common.cancel')`.
- Body scrolls (`max-h`, `overflow-y-auto`) for small screens; content is a
  centered card (`max-w-lg`) with the existing rounded/border styling.
- Reused later by Workstream 3 (admin dialogs), so it lives in its own file.

### 2.2 `AddExpenseForm` refactor

`AddExpenseForm` keeps the same props (`groupId`, `members`, `baseCurrency`) and
is still rendered by `group-detail.tsx` unchanged. Internally:

- Renders a **trigger**: a `Card` containing a full-width primary button
  `+ {t('expense.add')}` (`data-testid="add-expense-open"`). No form is mounted
  until opened.
- Holds `const [open, setOpen] = useState(false)`.
- Renders `<Modal open={open} onClose={() => setOpen(false)} title={t('expense.add')}>`
  wrapping the form.
- On `createExpense` success: existing reset logic **plus** `setOpen(false)`.
- All existing state, the FX `useEffect`, `submit()`, and invalidations are
  preserved verbatim.

## 3. Form layout inside the modal

### Essentials (always visible)

| Field         | Control                        | Notes                                                                    |
| ------------- | ------------------------------ | ------------------------------------------------------------------------ |
| Název         | `Input`                        | unchanged, `expense-title-input`                                         |
| Částka        | `Input`                        | unchanged, `expense-amount-input`; disabled for EXACT (as today)         |
| Zaplatil      | **single-select avatar chips** | replaces the payer `<select>`; default = first member; `payer-chip-{id}` |
| Rozdělit mezi | multi-select avatar chips      | unchanged behavior; default all selected                                 |

### Advanced — behind `▸ Více možností` (`expense-more-options`, collapsed)

| Field               | Control               | Notes                                                                                                                                                                        |
| ------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Měna                | `<select>`            | unchanged, `expense-currency-select`; FX `Input` (`expense-fx-input`) appears when currency ≠ base, with the same `fx.resolve` prefill + source note                         |
| Kategorie           | **icon-grid picker**  | `EXPENSE_CATEGORIES` as labelled `CategoryIcon` buttons; single-select; `category-chip-{key}`; a hidden control keeps `expense-category-select` semantics for value (see §6) |
| Dělení              | **segmented** buttons | EQUAL / EXACT / SHARES / PERCENTAGE; `split-type-{TYPE}`; reuses `split.*` labels                                                                                            |
| (per-member inputs) | `Input` rows          | unchanged; shown when split ≠ EQUAL; `per-member-inputs`, `member-value-{id}`                                                                                                |
| Opakování           | **segmented** buttons | none/daily/weekly/monthly/yearly; `recurrence-{value}`; reuses `recurrence.*` labels                                                                                         |

**Auto-expand rule:** "Více možností" starts expanded when any advanced field is
non-default (currency ≠ base, category ≠ `other`, split ≠ EQUAL, recurrence ≠
none) so relevant inputs are never hidden — e.g. after choosing a non-equal
split the per-member inputs stay visible.

### Footer

`[ Zrušit ]` (secondary, closes without saving) and `[ Uložit ]`
(`add-expense-submit`, unchanged submit).

## 4. Segmented control & chip patterns

- **Segmented control:** a `role="radiogroup"` (aria-label) of buttons, each
  `aria-pressed` / `aria-checked`, selected = brand fill, unselected = secondary.
  A small local `Segmented` helper in `add-expense-form.tsx` (or `ui.tsx` if it
  proves reusable) — keep it minimal, not a new public primitive unless WS3 needs
  it.
- **Payer chips:** reuse `MemberChip` with `onClick`/`selected`; single-select
  (clicking sets payer). Distinct visual selected state from the multi-select
  split chips is fine — they are in different labelled groups.

## 5. i18n

Add two keys to `cs.ts` + `en.ts` (and the `MessageKey` union source):

- `expense.moreOptions` — cs "Více možností" / en "More options"
- `expense.fewerOptions` — cs "Méně možností" / en "Fewer options"

Everything else reuses existing keys (`expense.add`, `expense.paidBy`,
`expense.splitBetween`, `expense.currency`, `expense.category`,
`expense.recurring`, `split.*`, `recurrence.*`, `common.cancel`,
`category.*`, `fx.*`).

## 6. Preserving behavior & test IDs

The submit logic is copied unchanged. Test IDs kept exactly: `expense-title-input`,
`expense-amount-input`, `expense-currency-select`, `expense-fx-input`,
`per-member-inputs`, `member-value-{id}`, `add-expense-submit`, plus the
split-between `MemberChip` buttons (role=button by name). **Replaced:** the payer
`<select>` (`expense-payer-select`), the split-type `<select>`
(`expense-split-type`), the recurrence `<select>` (`expense-recurrence-select`),
and the category `<select>` (`expense-category-select`) all become buttons. New
IDs: `add-expense-open`, `expense-more-options`, `split-type-{TYPE}`,
`payer-chip-{id}`, `category-chip-{key}`, `recurrence-{value}`.

**Category value:** the icon-grid buttons set the same `category` state directly.
The one E2E that did `selectOption` on `expense-category-select` switches to
clicking `category-chip-accommodation` (§7); no hidden mirror `<select>`.

## 7. Testing (TDD)

The 3 existing expense E2E tests must open the modal first (and expand advanced
where needed). Changes:

1. **New test — open/close & a11y:** click `add-expense-open` → dialog visible;
   run axe (`wcag2a`,`wcag2aa`) on the **open** dialog; press Escape → dialog
   hidden. Written first (RED).
2. **Critical journey (test 1):** after filling title/amount, open the modal is
   now the first step; category selection becomes
   `add-expense-open` → `expense-more-options` → click `category-chip-accommodation`.
3. **Exact split (test 2):** open modal → expand → click `split-type-EXACT` →
   fill `per-member-inputs`.
4. **FX (test 4):** open modal → expand → `expense-currency-select` EUR →
   `expense-fx-input`.

Each rewired test still asserts the same downstream outcome (balances, SPAYD,
converted base amount), proving the payload is unchanged. Full suite + axe must
stay green on all 4 Playwright projects (chromium/firefox/webkit/mobile).

## 8. Risks

- **Medium.** The native `<dialog>` is supported by all Playwright target
  browsers (Chromium/Firefox/WebKit ≥15.4). Focus-trap and backdrop are native;
  the main risk is backdrop-click detection and Escape wiring — covered by the
  new open/close test.
- Re-parenting the form into a dialog must not change the submit payload —
  guarded by keeping `submit()` verbatim and by the unchanged downstream
  assertions in the 3 rewired tests.
- Keep the trigger + modal within `AddExpenseForm` so `group-detail.tsx` and the
  other member-consuming components are untouched.
