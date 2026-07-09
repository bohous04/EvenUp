# Web UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved light-minimal, indigo-accent redesign (spec: `docs/superpowers/specs/2026-07-08-ui-redesign-design.md`) across the whole `apps/web` app: new tokens + component kit, restructured group screen (settle card → balance bars → transactions → FAB), amount-first expense sheet, dashboard, sign-in, and restyled secondary pages.

**Architecture:** Pure-Tailwind design-token swap plus a small component kit (`Sheet`, `Fab`, `MenuSheet`, `AmountText`, `AvatarStack`, `SectionLabel`, `EmptyState`) grown from the existing `ui.tsx`/`modal.tsx`. Screens are then restructured one at a time. All tRPC calls, split math, FX, and auth logic are untouched — this is a UI reshape.

**Tech Stack:** Next.js App Router, Tailwind v4 (`@theme` tokens), native `<dialog>`, lucide-react icons, tRPC/react-query, Playwright e2e.

## Global Constraints

- **No new dependencies.** Everything is Tailwind + native elements + lucide-react (already installed).
- **Accent:** indigo — `--color-brand-600: #4f46e5` (hover `#4338ca`, tint `#eef2ff`). Grays: Tailwind `zinc`. Page bg `zinc-50`/`zinc-950`, cards `white`/`zinc-900`, hairline borders `zinc-200`/`zinc-800`.
- **Amounts never wrap:** every money amount is rendered through `AmountText` (tabular-nums, `whitespace-nowrap`, spaces → NBSP). Never render `formatCurrency` output for a transaction/balance/settlement amount outside `AmountText`.
- **Icons:** SVG components from `@/components/icons` (lucide re-exports + hand-inlined brand logos). **Never emoji glyphs** (standing user rule).
- **i18n:** every new user-facing string gets a key in `packages/i18n/src/locales/cs.ts` (the `Messages` source type) **and** `en.ts` — a missing key in either is a compile error.
- **Logic freeze:** tRPC payloads, split-type math, FX handling, recurrence, auth logic unchanged.
- **Dark mode** stays functional (mirror classes on every new element: `dark:*`).
- **A11y:** existing axe checks (`wcag2a`, `wcag2aa`) in e2e must stay green; dialogs stay on native `<dialog>` + `showModal()`.
- **Commits:** conventional style (`feat(web): …`), **no Co-Authored-By or any Claude attribution trailer** (user rule).
- Commands run from the repo root. Web package filter: `pnpm --filter @evenup/web <script>`. Scripts: `lint`, `typecheck`, `build`, `test` (vitest, node-env server tests only), `test:e2e` (Playwright; needs the dev database — if it fails to start, run `docker compose up -d` first).
- **Test vehicle:** the web app has no component-test rig (vitest is node-env only). UI behavior is verified by Playwright e2e (`apps/web/e2e/critical-flow.spec.ts`). Tasks that change flows update e2e FIRST (red), then implement (green). Component-only tasks verify via `lint`+`typecheck`+`build` and are exercised by the following tasks' e2e.

---

### Task 1: Indigo tokens + zinc sweep + base kit restyle

**Files:**

- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/components/ui.tsx` (full rewrite below)
- Modify: `apps/web/src/app/layout.tsx:16` (themeColor)
- Modify: all `apps/web/src` files via mechanical `neutral-` → `zinc-` sweep
- Modify: `apps/web/public/manifest.webmanifest` (if it contains `#2563eb`)

**Interfaces:**

- Produces: `Button`, `Input`, `Select`, `Card`, `Label`, `iconButtonClass` (same signatures as today, restyled) plus new `SectionLabel` (h3 props) and `EmptyState({ icon?, title, action? })`. All later tasks import these from `@/components/ui`.

- [ ] **Step 1: Mechanical gray sweep (neutral → zinc)**

```bash
cd apps/web && grep -rl 'neutral-' src | xargs sed -i '' 's/neutral-/zinc-/g' && cd ../..
git diff --stat   # expect ~20 files changed, class renames only
```

- [ ] **Step 2: Replace the brand scale in `globals.css`**

Replace the whole `@theme` block and body colors; keep the reduced-motion block verbatim:

```css
@import 'tailwindcss';

@theme {
  --color-brand-50: #eef2ff;
  --color-brand-100: #e0e7ff;
  --color-brand-500: #6366f1;
  --color-brand-600: #4f46e5;
  --color-brand-700: #4338ca;
  --font-sans: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}

:root {
  color-scheme: light dark;
}

html,
body {
  height: 100%;
}

body {
  @apply bg-zinc-50 text-zinc-900 antialiased;
}

@media (prefers-color-scheme: dark) {
  body {
    @apply bg-zinc-950 text-zinc-100;
  }
}

/* Respect reduced motion (a11y §9.4). */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 3: Rewrite `ui.tsx`**

Full new content (existing exports keep their signatures; `SectionLabel` + `EmptyState` are new):

```tsx
'use client';
import { forwardRef } from 'react';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
};

const buttonStyles: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-brand-600',
  secondary:
    'bg-white text-zinc-900 border border-zinc-200 hover:bg-zinc-50 focus-visible:ring-zinc-400 dark:bg-zinc-800 dark:text-zinc-100 dark:border-zinc-700',
  ghost:
    'text-brand-600 hover:bg-brand-50 focus-visible:ring-brand-600 dark:text-brand-100 dark:hover:bg-brand-600/10',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', className = '', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${buttonStyles[variant]} ${className}`}
      {...props}
    />
  );
});

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...props }, ref) {
    return (
      <input
        ref={ref}
        className={`w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 ${className}`}
        {...props}
      />
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = '', children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={`w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 ${className}`}
        {...props}
      >
        {children}
      </select>
    );
  },
);

export function Card({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
      {...props}
    />
  );
}

/** Shared style for compact round icon-only buttons (rename, modal close, …). */
export const iconButtonClass =
  'inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100';

export function Label({ className = '', ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={`mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300 ${className}`}
      {...props}
    />
  );
}

/** Small uppercase muted card heading — the redesign's section label. */
export function SectionLabel({
  className = '',
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={`mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 ${className}`}
      {...props}
    />
  );
}

/** Friendly centered empty state used inside cards and sheets. */
export function EmptyState({
  icon,
  title,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      {icon ? <span className="text-zinc-300 dark:text-zinc-600">{icon}</span> : null}
      <p className="text-sm text-zinc-400">{title}</p>
      {action}
    </div>
  );
}
```

- [ ] **Step 4: Theme color in `layout.tsx` and the PWA manifest**

In `apps/web/src/app/layout.tsx` change `themeColor: '#2563eb'` → `themeColor: '#4f46e5'`. Then:

```bash
grep -rn '2563eb' apps/web/public apps/web/src || echo clean
```

Replace any remaining `#2563eb` occurrences (e.g. in `manifest.webmanifest`) with `#4f46e5`.

- [ ] **Step 5: Verify**

```bash
pnpm --filter @evenup/web lint && pnpm --filter @evenup/web typecheck && pnpm --filter @evenup/web build
```

Expected: all pass (class renames don't change structure).

- [ ] **Step 6: Commit**

```bash
git add -A apps/web
git commit -m "feat(web): indigo design tokens, zinc grays, restyled base kit"
```

---

### Task 2: AmountText, Avatar sizes + AvatarStack, icon additions

**Files:**

- Create: `apps/web/src/components/amount-text.tsx`
- Modify: `apps/web/src/components/member-chip.tsx`
- Modify: `apps/web/src/components/icons.tsx`

**Interfaces:**

- Produces:
  - `AmountText({ minorUnits: number; currency: string; colored?: boolean; className?: string; testId?: string })` — the only allowed renderer for money amounts.
  - `MemberChip` gains size `'xs'` (existing `'sm' | 'md'` unchanged).
  - `AvatarStack({ members: { id: string; initials: string; color: string; displayName: string }[]; max?: number })`.
  - New icon exports: `MoreHorizontal, Settings, Users, BarChart3, History, FileUp, Landmark, ChevronRight, ChevronLeft, Calendar, Repeat, LogOut` and `GoogleLogo({ size? })`; re-export `type LucideIcon`.

- [ ] **Step 1: Create `amount-text.tsx`**

```tsx
'use client';
import { useI18n } from '@/lib/i18n';

/**
 * Money amounts: tabular digits, optional sign coloring, and never wrapped —
 * regular spaces from the formatter become NBSP (design-spec hard rule).
 */
export function AmountText({
  minorUnits,
  currency,
  colored = false,
  className = '',
  testId,
}: {
  minorUnits: number;
  currency: string;
  colored?: boolean;
  className?: string;
  testId?: string;
}) {
  const { formatCurrency } = useI18n();
  const text = formatCurrency(minorUnits, currency).replace(/ /g, ' ');
  const color = !colored
    ? ''
    : minorUnits === 0
      ? 'text-zinc-400'
      : minorUnits > 0
        ? 'text-green-600 dark:text-green-400'
        : 'text-red-600 dark:text-red-400';
  return (
    <span className={`whitespace-nowrap tabular-nums ${color} ${className}`} data-testid={testId}>
      {text}
    </span>
  );
}
```

- [ ] **Step 2: Extend `member-chip.tsx`**

Change the size union and dims map, and append `AvatarStack` at the end of the file:

```tsx
// size prop type becomes:
size?: 'xs' | 'sm' | 'md';
// dims becomes:
const dims =
  size === 'xs' ? 'h-5 w-5 text-[9px]' : size === 'sm' ? 'h-7 w-7 text-xs' : 'h-9 w-9 text-sm';
```

```tsx
/** Overlapping avatar row with a "+N" overflow badge (dashboard group cards). */
export function AvatarStack({
  members,
  max = 5,
}: {
  members: { id: string; initials: string; color: string; displayName: string }[];
  max?: number;
}) {
  const shown = members.slice(0, max);
  const extra = members.length - shown.length;
  return (
    <span className="flex items-center">
      {shown.map((m) => (
        <span
          key={m.id}
          className="-ml-1.5 rounded-full ring-2 ring-white first:ml-0 dark:ring-zinc-900"
        >
          <MemberChip initials={m.initials} color={m.color} name={m.displayName} size="sm" />
        </span>
      ))}
      {extra > 0 ? (
        <span className="-ml-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-500 ring-2 ring-white dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-900">
          +{extra}
        </span>
      ) : null}
    </span>
  );
}
```

- [ ] **Step 3: Extend `icons.tsx`**

Add to the lucide import list: `MoreHorizontal, Settings, Users, BarChart3, History, FileUp, Landmark, ChevronRight, ChevronLeft, Calendar, Repeat, LogOut`. Extend the bottom re-export line to include them, and re-export the type:

```tsx
export {
  Scale,
  Mail,
  Camera,
  Check,
  ArrowRight,
  Trash2,
  Plus,
  Pencil,
  X,
  ChevronDown,
  MoreHorizontal,
  Settings,
  Users,
  BarChart3,
  History,
  FileUp,
  Landmark,
  ChevronRight,
  ChevronLeft,
  Calendar,
  Repeat,
  LogOut,
};
export type { LucideIcon };
```

Add the Google brand logo next to `AppleLogo` (lucide has no brand marks):

```tsx
/** Official multicolor Google "G", for the OAuth button. */
export function GoogleLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden focusable="false">
      <path
        fill="#FFC107"
        d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"
      />
    </svg>
  );
}
```

- [ ] **Step 4: Verify and commit**

```bash
pnpm --filter @evenup/web lint && pnpm --filter @evenup/web typecheck && pnpm --filter @evenup/web build
git add apps/web/src/components
git commit -m "feat(web): AmountText, AvatarStack, xs avatars, redesign icons"
```

---

### Task 3: Sheet, Fab, MenuSheet components

**Files:**

- Create: `apps/web/src/components/sheet.tsx`
- Create: `apps/web/src/components/fab.tsx`
- Create: `apps/web/src/components/menu-sheet.tsx`

**Interfaces:**

- Consumes: `iconButtonClass` from Task 1; icons from Task 2.
- Produces:
  - `Sheet({ open, onClose, title, children, testId? })` — same props as `Modal`; bottom sheet under `sm`, centered dialog above. Close button testid: `sheet-close`.
  - `Fab(props: ButtonHTMLAttributes)` — fixed bottom-right circular indigo button; children default to a `Plus` icon. Callers pass `aria-label` and `data-testid`.
  - `MenuSheet({ open, onClose, title, items })` with `items: { key: string; icon: LucideIcon; label: string; onSelect: () => void }[]`; each row gets `data-testid="menu-<key>"`.

- [ ] **Step 1: Create `sheet.tsx`**

Same native-`<dialog>` mechanics as `modal.tsx` (copy the refs/effects/handlers verbatim), different shell:

```tsx
'use client';
import { useEffect, useId, useRef } from 'react';
import { useI18n } from '@/lib/i18n';
import { iconButtonClass } from '@/components/ui';
import { X } from '@/components/icons';

/**
 * Accessible sheet on the native `<dialog>` element — the same mechanics as
 * Modal (focus trap, top layer, Escape, backdrop-close) but presented as a
 * bottom sheet on phones and a centered card from `sm` up.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  testId,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  testId?: string;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const pressedOnBackdrop = useRef(false);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
      onMouseDown={(e) => {
        pressedOnBackdrop.current = e.target === ref.current;
      }}
      onClick={(e) => {
        if (e.target === ref.current && pressedOnBackdrop.current) onClose();
      }}
      className="bottom-0 top-auto m-0 w-full max-w-none rounded-t-2xl border border-b-0 border-zinc-200 bg-white p-0 text-zinc-900 shadow-2xl backdrop:bg-black/40 sm:bottom-auto sm:top-auto sm:m-auto sm:w-[calc(100%-2rem)] sm:max-w-lg sm:rounded-2xl sm:border-b dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
    >
      {open ? (
        <div
          className="max-h-[92dvh] overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-h-[85vh]"
          data-testid={testId}
        >
          <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-zinc-200 sm:hidden dark:bg-zinc-700" />
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 id={titleId} className="text-lg font-bold tracking-tight">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.cancel')}
              title={t('common.cancel')}
              className={iconButtonClass}
              data-testid="sheet-close"
            >
              <X size={18} aria-hidden />
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
```

Note: the native `<dialog>` UA style is `position: fixed; inset: 0; margin: auto` — `bottom-0 top-auto m-0 w-full` pins it to the bottom edge on phones; the `sm:` overrides restore centering.

- [ ] **Step 2: Create `fab.tsx`**

```tsx
'use client';
import { forwardRef } from 'react';
import { Plus } from '@/components/icons';

/** Fixed bottom-right floating action button. Pass `aria-label` and `data-testid`. */
export const Fab = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  function Fab({ className = '', children, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        className={`fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30 transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 ${className}`}
        {...props}
      >
        {children ?? <Plus size={26} aria-hidden />}
      </button>
    );
  },
);
```

- [ ] **Step 3: Create `menu-sheet.tsx`**

```tsx
'use client';
import { Sheet } from '@/components/sheet';
import { ChevronRight, type LucideIcon } from '@/components/icons';

export interface MenuSheetItem {
  key: string;
  icon: LucideIcon;
  label: string;
  onSelect: () => void;
}

/** A sheet of tappable rows — the redesign's "⋯" menu on mobile and desktop. */
export function MenuSheet({
  open,
  onClose,
  title,
  items,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  items: MenuSheetItem[];
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title} testId="group-menu">
      <ul className="-mx-2">
        {items.map((it) => (
          <li key={it.key}>
            <button
              type="button"
              onClick={it.onSelect}
              data-testid={`menu-${it.key}`}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 dark:hover:bg-zinc-800"
            >
              <it.icon size={18} aria-hidden className="text-zinc-400" />
              <span className="flex-1">{it.label}</span>
              <ChevronRight size={16} aria-hidden className="text-zinc-300 dark:text-zinc-600" />
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
```

- [ ] **Step 4: Verify and commit**

```bash
pnpm --filter @evenup/web lint && pnpm --filter @evenup/web typecheck && pnpm --filter @evenup/web build
git add apps/web/src/components
git commit -m "feat(web): Sheet, Fab, and MenuSheet kit components"
```

Note: the spec's generic `ListRow` is deliberately not built as a kit component — the three row shapes (menu row here, settle row in Task 4, transaction row in Task 5) differ structurally, so each is implemented in place (YAGNI).

---

### Task 4: Settle card + balance bars (replace BalancesPanel)

**Files:**

- Create: `apps/web/src/components/settle-card.tsx`
- Create: `apps/web/src/components/balances-card.tsx`
- Delete: `apps/web/src/components/balances-panel.tsx`
- Modify: `apps/web/src/components/group-detail.tsx:111-120` (swap the panel for the two new cards)

**Interfaces:**

- Consumes: `Sheet` (Task 3), `AmountText` (Task 2), `SectionLabel`/`Card`/`Button` (Task 1), existing `trpc.balance.get`, `trpc.settlement.generateSpayd`, `trpc.transaction.recordTransfer`, `QrCode`.
- Produces: `SettleCard({ groupId, members, baseCurrency })` and `BalancesCard({ groupId, baseCurrency })` where `members: { id; displayName; initials; color }[]`.
- Preserved testids: `payments-list`, `settled-up`, `settle-btn` (now the whole tappable row), `mark-cash`, `mark-paid`, `balance-<memberId>`. New: `settle-sheet`.

- [ ] **Step 1: Baseline — run the two e2e tests that exercise settling**

```bash
pnpm --filter @evenup/web test:e2e -- --grep "settle|SPAYD"
```

Expected: PASS (baseline before the change).

- [ ] **Step 2: Create `settle-card.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Button, Card, SectionLabel } from '@/components/ui';
import { AmountText } from '@/components/amount-text';
import { MemberChip } from '@/components/member-chip';
import { QrCode } from '@/components/qr-code';
import { Sheet } from '@/components/sheet';
import { ArrowRight, ChevronRight } from '@/components/icons';

interface MemberLite {
  id: string;
  displayName: string;
  initials: string;
  color: string;
}

/** The group's lead card: minimal settlement payments, each row opening a settle sheet. */
export function SettleCard({
  groupId,
  members,
  baseCurrency,
}: {
  groupId: string;
  members: MemberLite[];
  baseCurrency: string;
}) {
  const { t } = useI18n();
  const balances = trpc.balance.get.useQuery({ groupId });
  const byId = new Map(members.map((m) => [m.id, m]));

  if (!balances.data) return null;
  const payments = balances.data.payments;

  return (
    <Card>
      <SectionLabel>{t('balance.suggestedPayments')}</SectionLabel>
      {payments.length === 0 ? (
        <p className="py-2 text-center text-sm text-zinc-400" data-testid="settled-up">
          {t('balance.settledUp')}
        </p>
      ) : (
        <ul className="-mx-2" data-testid="payments-list">
          {payments.map((p, i) => (
            <SettleRow
              key={`${p.fromMemberId}-${p.toMemberId}-${i}`}
              groupId={groupId}
              baseCurrency={baseCurrency}
              from={byId.get(p.fromMemberId)}
              to={byId.get(p.toMemberId)}
              amount={p.amountMinorUnits}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function SettleRow({
  groupId,
  baseCurrency,
  from,
  to,
  amount,
}: {
  groupId: string;
  baseCurrency: string;
  from?: MemberLite;
  to?: MemberLite;
  amount: number;
}) {
  const { t } = useI18n();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);

  const spayd = trpc.settlement.generateSpayd.useQuery(
    { groupId, toMemberId: to?.id ?? '', amountMinorUnits: amount, currency: baseCurrency },
    { enabled: open && !!to, retry: false },
  );
  const recordTransfer = trpc.transaction.recordTransfer.useMutation({
    onSuccess: () => {
      setOpen(false);
      void utils.balance.get.invalidate({ groupId });
      void utils.transaction.list.invalidate({ groupId });
      void utils.activity.list.invalidate({ groupId });
    },
  });

  if (!from || !to) return null;

  const record = (method: 'CASH' | 'QR') =>
    recordTransfer.mutate({
      groupId,
      fromMemberId: from.id,
      toMemberId: to.id,
      amountMinorUnits: amount,
      currency: baseCurrency,
      method,
    });

  return (
    <li>
      {/* The whole row is the tap target (approved in mockups) — no separate button. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="settle-btn"
        className="flex w-full items-center gap-2 rounded-xl px-2 py-2.5 text-left text-sm font-semibold transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 dark:hover:bg-zinc-800"
      >
        <MemberChip initials={from.initials} color={from.color} name={from.displayName} size="sm" />
        <span className="min-w-0 truncate">{from.displayName}</span>
        <ArrowRight size={14} aria-hidden className="shrink-0 text-zinc-300 dark:text-zinc-600" />
        <MemberChip initials={to.initials} color={to.color} name={to.displayName} size="sm" />
        <span className="min-w-0 truncate">{to.displayName}</span>
        <AmountText
          minorUnits={amount}
          currency={baseCurrency}
          className="ml-auto font-bold text-brand-600 dark:text-brand-100"
        />
        <ChevronRight size={16} aria-hidden className="shrink-0 text-zinc-300 dark:text-zinc-600" />
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('settle.title')}
        testId="settle-sheet"
      >
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <MemberChip
              initials={from.initials}
              color={from.color}
              name={from.displayName}
              size="sm"
            />
            {from.displayName}
            <ArrowRight size={14} aria-hidden className="text-zinc-300 dark:text-zinc-600" />
            <MemberChip initials={to.initials} color={to.color} name={to.displayName} size="sm" />
            {to.displayName}
          </div>
          <AmountText
            minorUnits={amount}
            currency={baseCurrency}
            className="text-3xl font-extrabold tracking-tight"
          />
          {spayd.data ? (
            <>
              <QrCode value={spayd.data.spayd} />
              <code className="max-w-full break-all text-center text-[10px] text-zinc-400">
                {spayd.data.spayd}
              </code>
            </>
          ) : spayd.isError ? (
            <p className="text-xs text-zinc-400">{t('settle.noIban')}</p>
          ) : (
            <p className="text-xs text-zinc-400">{t('common.loading')}</p>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => record('CASH')} data-testid="mark-cash">
              {t('settle.method.cash')}
            </Button>
            <Button onClick={() => record('QR')} data-testid="mark-paid">
              {t('settle.markPaid')}
            </Button>
          </div>
        </div>
      </Sheet>
    </li>
  );
}
```

- [ ] **Step 3: Create `balances-card.tsx`**

```tsx
'use client';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Card, SectionLabel } from '@/components/ui';
import { AmountText } from '@/components/amount-text';
import { MemberChip } from '@/components/member-chip';

/** Per-member balances as bars diverging from a center line (green = is owed). */
export function BalancesCard({ groupId, baseCurrency }: { groupId: string; baseCurrency: string }) {
  const { t } = useI18n();
  const balances = trpc.balance.get.useQuery({ groupId });

  if (balances.isLoading) return <p className="text-zinc-400">{t('common.loading')}</p>;
  if (!balances.data) return null;

  const max = Math.max(...balances.data.balances.map((b) => Math.abs(b.balanceMinorUnits)), 1);

  return (
    <Card>
      <SectionLabel>{t('balance.title')}</SectionLabel>
      <ul className="space-y-2.5">
        {balances.data.balances.map((b) => {
          const positive = b.balanceMinorUnits > 0;
          const pct = (Math.abs(b.balanceMinorUnits) / max) * 50;
          return (
            <li key={b.memberId} className="flex items-center gap-2">
              <span className="flex w-28 min-w-0 items-center gap-1.5">
                <MemberChip initials={b.initials} color={b.color} name={b.displayName} size="sm" />
                <span className="truncate text-sm">{b.displayName}</span>
              </span>
              <span
                className="relative h-2 flex-1 rounded-full bg-zinc-100 dark:bg-zinc-800"
                aria-hidden
              >
                <span className="absolute inset-y-0 left-1/2 w-px bg-zinc-200 dark:bg-zinc-700" />
                {b.balanceMinorUnits !== 0 ? (
                  <span
                    className={`absolute inset-y-0 rounded-full ${
                      positive ? 'left-1/2 bg-green-400' : 'right-1/2 bg-red-400'
                    }`}
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  />
                ) : null}
              </span>
              <AmountText
                minorUnits={b.balanceMinorUnits}
                currency={baseCurrency}
                colored
                className="w-24 text-right text-sm font-semibold"
                testId={`balance-${b.memberId}`}
              />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
```

- [ ] **Step 4: Swap into `group-detail.tsx` and delete the old panel**

In `group-detail.tsx`, replace the `<BalancesPanel …/>` block (lines 111–120) with:

```tsx
<SettleCard
  groupId={groupId}
  members={activeMembers.map((m) => ({
    id: m.id,
    displayName: m.displayName,
    initials: m.initials,
    color: m.color,
  }))}
  baseCurrency={group.data.baseCurrency}
/>

<BalancesCard groupId={groupId} baseCurrency={group.data.baseCurrency} />
```

Update the imports (`BalancesPanel` → `SettleCard`, `BalancesCard`) and delete the file:

```bash
rm apps/web/src/components/balances-panel.tsx
```

- [ ] **Step 5: Verify e2e still green, commit**

```bash
pnpm --filter @evenup/web lint && pnpm --filter @evenup/web typecheck
pnpm --filter @evenup/web test:e2e -- --grep "settle|SPAYD"
git add -A apps/web/src/components
git commit -m "feat(web): settle card with tappable rows + diverging balance bars"
```

Expected: PASS — `settle-btn`, `mark-cash`, `mark-paid`, SPAYD text, and `balance-*` testids all survived the restructure.

---

### Task 5: Group page restructure — header, transactions, ⋯ menu with sheets

**Files:**

- Modify: `apps/web/src/components/group-detail.tsx` (full rewrite below)
- Modify: `apps/web/src/components/spend-stats.tsx`, `activity-feed.tsx`, `csv-import.tsx`, `bank-details-form.tsx` (strip `Card` wrappers/headings — a titled `Sheet` now frames them)
- Modify: `packages/i18n/src/locales/cs.ts`, `packages/i18n/src/locales/en.ts` (3 new keys)
- Modify: `apps/web/e2e/helpers.ts`, `apps/web/e2e/critical-flow.spec.ts`

**Interfaces:**

- Consumes: `MenuSheet`/`Sheet` (Task 3), `SettleCard`/`BalancesCard` (Task 4), `AmountText`, `SectionLabel`.
- Produces: group page renders **only** header → SettleCard → BalancesCard → transactions card → (AddExpenseForm trigger, reshaped in Task 6). Menu trigger testid `group-menu-btn`; items `menu-members`, `menu-invite`, `menu-stats`, `menu-activity`, `menu-csv`, `menu-bank`. e2e helper `openGroupSheet(page, item)`.
- New i18n keys: `common.showAll`, `group.spentTotal` (param `{total}`), `group.menu`.

- [ ] **Step 1: Add the i18n keys**

`packages/i18n/src/locales/cs.ts` (insert near the other `common.*` / `group.*` keys):

```ts
'common.showAll': 'Zobrazit vše',
'group.spentTotal': 'Utraceno {total}',
'group.menu': 'Možnosti skupiny',
```

`packages/i18n/src/locales/en.ts`:

```ts
'common.showAll': 'Show all',
'group.spentTotal': '{total} spent',
'group.menu': 'Group options',
```

- [ ] **Step 2: Update e2e first (RED)**

Add to `apps/web/e2e/helpers.ts`:

```ts
import type { Page } from '@playwright/test';

/** Open the group "⋯" menu and select one of its items (menu-<item> testid). */
export async function openGroupSheet(page: Page, item: string) {
  await page.getByTestId('group-menu-btn').click();
  await page.getByTestId(`menu-${item}`).click();
}

/** Close the currently open sheet via its X button. */
export async function closeSheet(page: Page) {
  await page.getByTestId('sheet-close').click();
}
```

In `critical-flow.spec.ts`, import them (`import { signIn, uniqueEmail, openGroupSheet, closeSheet } from './helpers';`) and update every flow that used on-page features:

**Member adds** (tests: journey, exact-split, OCR, FX, CSV, modal, advanced, rename) — wrap each add block:

```ts
await openGroupSheet(page, 'members');
await page.getByTestId('member-name-input').fill('Petr');
await page.getByTestId('add-member-btn').click();
await expect(page.getByRole('img', { name: 'Petr' }).first()).toBeVisible();
await closeSheet(page);
```

(In the first test's two-name loop, open the sheet before the loop and close after it.)

**Activity assertions** (journey test) — before the `activity-list` expectations insert `await openGroupSheet(page, 'activity');`, and after the last activity assertion add `await closeSheet(page);`.

**Spend stats** (journey + CSV tests) — before `spend-stats` expectations: `await openGroupSheet(page, 'stats');` … `await closeSheet(page);`.

**IBAN** (exact-split test) — replace the direct fill with:

```ts
await openGroupSheet(page, 'bank');
await page.getByTestId('bank-iban-input').fill('CZ6508000000192000145399');
await page.getByTestId('bank-save-btn').click();
await closeSheet(page);
```

**CSV** (CSV test) — replace `await page.getByTestId('csv-toggle').click();` with `await openGroupSheet(page, 'csv');` (the `csv-toggle` testid disappears).

**Invite** (invite a11y test) — before `invite-btn`: `await openGroupSheet(page, 'invite');`.

**Rename** (rename test) — before the `member-list` interactions: `await openGroupSheet(page, 'members');` (the rename editor lives in the members sheet now).

Run to confirm RED:

```bash
pnpm --filter @evenup/web test:e2e
```

Expected: FAIL — `group-menu-btn` does not exist yet.

- [ ] **Step 3: Strip the Card wrappers from the four sheet-content components**

Each becomes bare content — the `Sheet` supplies title and frame. Keep every testid.

`spend-stats.tsx` — replace the `return` block's wrapper: `<Card><h3 …>{t('stats.spendByCategory')}</h3>…</Card>` becomes a fragment, and the early return changes so an empty state shows inside the sheet:

```tsx
if (!stats.data || stats.data.length === 0) {
  return <p className="py-4 text-center text-sm text-zinc-400">—</p>;
}
return (
  <ul className="space-y-2" data-testid="spend-stats">
    …existing list items unchanged…
  </ul>
);
```

(Remove the now-unused `Card` import.)

`activity-feed.tsx` — replace `<Card><h3 …>{t('nav.activity')}</h3>` + closing `</Card>` with `<div>` / `</div>`; remove the `Card` import. Everything else unchanged.

`csv-import.tsx` — remove the `Card` wrapper, the header row, and the `open` state/toggle entirely (the sheet is the disclosure). The component body becomes just the `<form>` (previously inside `{open ? … : null}`), always rendered. Remove the `csv-toggle` button. Keep `csv-payer-select`, `csv-input`, `csv-result`, `csv-import-btn`.

`bank-details-form.tsx` — remove the `Card` wrapper and the `<h3>{t('member.iban')}</h3>` heading (the sheet title carries it); keep the form and its testids.

- [ ] **Step 4: Rewrite `group-detail.tsx`**

```tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Button, Card, SectionLabel, iconButtonClass } from '@/components/ui';
import { AmountText } from '@/components/amount-text';
import { MemberChip } from '@/components/member-chip';
import { MemberList } from '@/components/member-list';
import { AddMemberForm } from '@/components/add-member-form';
import { AddExpenseForm } from '@/components/add-expense-form';
import { SettleCard } from '@/components/settle-card';
import { BalancesCard } from '@/components/balances-card';
import { OcrScan } from '@/components/ocr-scan';
import { SpendStats } from '@/components/spend-stats';
import { CsvImport } from '@/components/csv-import';
import { ActivityFeed } from '@/components/activity-feed';
import { BankDetailsForm } from '@/components/bank-details-form';
import { Sheet } from '@/components/sheet';
import { MenuSheet } from '@/components/menu-sheet';
import {
  Users,
  Mail,
  BarChart3,
  History,
  FileUp,
  Landmark,
  MoreHorizontal,
  ChevronLeft,
} from '@/components/icons';

type Panel = 'members' | 'invite' | 'stats' | 'activity' | 'csv' | 'bank' | null;

export function GroupDetail({ groupId }: { groupId: string }) {
  const { t, formatCurrency, formatDate } = useI18n();
  const group = trpc.group.get.useQuery({ groupId });
  const transactions = trpc.transaction.list.useQuery({ groupId });
  const stats = trpc.stats.byCategory.useQuery({ groupId });

  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [showAll, setShowAll] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const createInvite = trpc.invite.create.useMutation({
    onSuccess: (invite) => {
      setInviteUrl(`${window.location.origin}/invite/${invite.token}`);
    },
  });

  if (group.isLoading) return <p className="text-zinc-400">{t('common.loading')}</p>;
  if (group.isError || !group.data) {
    return (
      <Card>
        <p className="text-red-700 dark:text-red-400">{t('error.notFound')}</p>
        <Link href="/" className="mt-2 inline-block text-brand-600 underline">
          {t('common.back')}
        </Link>
      </Card>
    );
  }

  const activeMembers = group.data.members.filter((m) => m.isActive);
  const memberLite = activeMembers.map((m) => ({
    id: m.id,
    displayName: m.displayName,
    initials: m.initials,
    color: m.color,
  }));
  const totalSpent = (stats.data ?? []).reduce((a, s) => a + Math.abs(s.totalMinorUnits), 0);
  const txs = transactions.data ?? [];
  const visibleTxs = showAll ? txs : txs.slice(0, 5);

  const openPanel = (p: Exclude<Panel, null>) => {
    setMenuOpen(false);
    setPanel(p);
  };

  const menuItems = [
    {
      key: 'members',
      icon: Users,
      label: t('group.members'),
      onSelect: () => openPanel('members'),
    },
    { key: 'invite', icon: Mail, label: t('invite.create'), onSelect: () => openPanel('invite') },
    {
      key: 'stats',
      icon: BarChart3,
      label: t('stats.spendByCategory'),
      onSelect: () => openPanel('stats'),
    },
    {
      key: 'activity',
      icon: History,
      label: t('nav.activity'),
      onSelect: () => openPanel('activity'),
    },
    { key: 'csv', icon: FileUp, label: 'CSV import', onSelect: () => openPanel('csv') },
    { key: 'bank', icon: Landmark, label: t('member.iban'), onSelect: () => openPanel('bank') },
  ];

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/"
            className="inline-flex items-center gap-0.5 text-xs text-zinc-400 hover:underline"
          >
            <ChevronLeft size={13} aria-hidden />
            {t('nav.groups')}
          </Link>
          <h1 className="truncate text-2xl font-extrabold tracking-tight" data-testid="group-title">
            {group.data.name}
          </h1>
          {totalSpent > 0 ? (
            <p className="text-sm text-zinc-400">
              {t('group.spentTotal', {
                total: formatCurrency(totalSpent, group.data.baseCurrency),
              })}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label={t('group.menu')}
          title={t('group.menu')}
          className={iconButtonClass}
          data-testid="group-menu-btn"
        >
          <MoreHorizontal size={20} aria-hidden />
        </button>
      </div>

      <SettleCard groupId={groupId} members={memberLite} baseCurrency={group.data.baseCurrency} />
      <BalancesCard groupId={groupId} baseCurrency={group.data.baseCurrency} />

      {/* Recent transactions */}
      <Card>
        <SectionLabel>{t('nav.transactions')}</SectionLabel>
        {visibleTxs.length > 0 ? (
          <>
            <ul
              className="divide-y divide-zinc-100 dark:divide-zinc-800"
              data-testid="transactions-list"
            >
              {visibleTxs.map((tx) => {
                const payer = tx.payers[0]?.member;
                return (
                  <li key={tx.id} className="flex items-center gap-3 py-2.5">
                    {payer ? (
                      <MemberChip
                        initials={payer.initials}
                        color={payer.color}
                        name={payer.displayName}
                        size="sm"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{tx.title}</p>
                      <p className="text-xs text-zinc-400">
                        {tx.type === 'TRANSFER'
                          ? t('expense.transfer')
                          : (payer?.displayName ?? '')}{' '}
                        · {formatDate(tx.date)}
                      </p>
                      {tx.hasReceiptImage ? (
                        <a
                          href={`/api/receipts/${tx.receiptId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-brand-600 underline"
                          data-testid="view-receipt"
                        >
                          {t('receipt.view')}
                        </a>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <AmountText
                        minorUnits={Number(tx.baseMinorUnits)}
                        currency={group.data.baseCurrency}
                        className="text-sm font-semibold"
                      />
                      {tx.currency !== group.data.baseCurrency ? (
                        <AmountText
                          minorUnits={Number(tx.totalMinorUnits)}
                          currency={tx.currency}
                          className="block text-xs text-zinc-400"
                        />
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            {!showAll && txs.length > 5 ? (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="mt-2 w-full rounded-xl py-2 text-center text-sm font-semibold text-brand-600 transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 dark:hover:bg-brand-600/10"
                data-testid="tx-show-all"
              >
                {t('common.showAll')}
              </button>
            ) : null}
          </>
        ) : (
          <p className="py-2 text-center text-sm text-zinc-400">—</p>
        )}
      </Card>

      {/* Expense entry trigger (reshaped into a FAB + sheet in the next task) */}
      {activeMembers.length > 0 ? (
        <>
          <AddExpenseForm
            groupId={groupId}
            members={memberLite}
            baseCurrency={group.data.baseCurrency}
          />
          <OcrScan groupId={groupId} members={memberLite} baseCurrency={group.data.baseCurrency} />
        </>
      ) : null}

      {/* ⋯ menu + feature sheets */}
      <MenuSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={t('group.menu')}
        items={menuItems}
      />

      <Sheet open={panel === 'members'} onClose={() => setPanel(null)} title={t('group.members')}>
        <MemberList groupId={groupId} members={memberLite} />
        <AddMemberForm groupId={groupId} />
      </Sheet>

      <Sheet open={panel === 'invite'} onClose={() => setPanel(null)} title={t('invite.create')}>
        <div className="space-y-3">
          <Button
            onClick={() => createInvite.mutate({ groupId })}
            disabled={createInvite.isPending}
            data-testid="invite-btn"
          >
            {createInvite.isPending ? t('common.loading') : t('invite.create')}
          </Button>
          {inviteUrl ? (
            <div>
              <p className="mb-1 text-sm font-medium">{t('invite.link')}</p>
              <code className="break-all text-xs text-brand-600" data-testid="invite-url">
                {inviteUrl}
              </code>
            </div>
          ) : null}
        </div>
      </Sheet>

      <Sheet
        open={panel === 'stats'}
        onClose={() => setPanel(null)}
        title={t('stats.spendByCategory')}
      >
        <SpendStats groupId={groupId} baseCurrency={group.data.baseCurrency} />
      </Sheet>

      <Sheet open={panel === 'activity'} onClose={() => setPanel(null)} title={t('nav.activity')}>
        <ActivityFeed
          groupId={groupId}
          members={activeMembers.map((m) => ({ id: m.id, displayName: m.displayName }))}
          baseCurrency={group.data.baseCurrency}
        />
      </Sheet>

      <Sheet open={panel === 'csv'} onClose={() => setPanel(null)} title="CSV import">
        <CsvImport
          groupId={groupId}
          members={activeMembers.map((m) => ({ id: m.id, displayName: m.displayName }))}
        />
      </Sheet>

      <Sheet open={panel === 'bank'} onClose={() => setPanel(null)} title={t('member.iban')}>
        <BankDetailsForm
          members={activeMembers.map((m) => ({ id: m.id, displayName: m.displayName }))}
        />
      </Sheet>
    </div>
  );
}
```

- [ ] **Step 5: Run e2e (GREEN), lint/typecheck, commit**

```bash
pnpm --filter @evenup/web lint && pnpm --filter @evenup/web typecheck
pnpm --filter @evenup/web test:e2e
git add -A apps/web packages/i18n
git commit -m "feat(web): group page restructure — hero order, recent transactions, group menu sheets"
```

Expected: full suite PASS. If an axe violation appears on an open sheet, fix contrast/labels in the sheet, not by removing the check.

---

### Task 6: Expense sheet — FAB trigger, amount-first layout, OCR inside

**Files:**

- Modify: `apps/web/src/components/add-expense-form.tsx` (full rewrite below)
- Modify: `apps/web/src/components/ocr-scan.tsx` (strip Card wrapper, add `onSaved`)
- Modify: `apps/web/src/components/group-detail.tsx` (remove the standalone `<OcrScan …/>` render + import)
- Modify: `apps/web/e2e/critical-flow.spec.ts`

**Interfaces:**

- Consumes: `Sheet`, `Fab` (Task 3), `AmountText` (Task 2), `splitEqually` + `decimalStringToMinor` from `@evenup/core` (already exported).
- Produces: `AddExpenseForm` keeps its props `{ groupId, members, baseCurrency }` but renders a `Fab` (testid `add-expense-open`, aria-label `t('expense.add')`) + amount-first `Sheet`. `OcrScan` gains optional `onSaved?: () => void` and loses its Card wrapper (parent frames it in a Sheet titled `t('ocr.scan')`).
- Testid changes: `expense-more-options` **removed**; new row testids `expense-split-row`, `expense-category-row`, `expense-date-row`, `expense-repeat-row`, `expense-receipt-row`, `expense-date-input`. `expense-currency-select` is now **always** rendered. All other expense/OCR testids unchanged.

- [ ] **Step 1: Update e2e first (RED)**

In `critical-flow.spec.ts`:

**Journey test** — the expense block becomes:

```ts
await page.getByTestId('add-expense-open').click();
await page.getByTestId('expense-amount-input').fill('900');
await page.getByTestId('expense-title-input').fill('Chata');
await page.getByTestId('expense-category-row').click();
await page.getByTestId('category-chip-accommodation').click();
await page.getByTestId('add-expense-submit').click();
```

**Exact-split test** — becomes:

```ts
await page.getByTestId('add-expense-open').click();
await page.getByTestId('expense-title-input').fill('Nájem');
await page.getByTestId('expense-split-row').click();
await page.getByTestId('split-type-EXACT').click();
const inputs = page.getByTestId('per-member-inputs').locator('input');
await inputs.nth(0).fill('0');
await inputs.nth(1).fill('100');
await page.getByTestId('add-expense-submit').click();
```

**FX test** — becomes (currency select is always visible now, no more-options step):

```ts
await page.getByTestId('add-expense-open').click();
await page.getByTestId('expense-amount-input').fill('100');
await page.getByTestId('expense-title-input').fill('Lanovka');
await page.getByTestId('expense-currency-select').selectOption('EUR');
await page.getByTestId('expense-fx-input').fill('25');
await page.getByTestId('add-expense-submit').click();
```

**Modal/Escape test** — unchanged flow (`add-expense-open` is now the FAB; same testid, still a button).

**Advanced-reset test** — replace the more-options interactions and final assertions:

```ts
await page.getByTestId('add-expense-open').click();
await page.getByTestId('expense-title-input').fill('Nájem');
await page.getByTestId('expense-split-row').click();
await page.getByTestId('split-type-EXACT').click();
await expect(page.getByTestId('per-member-inputs')).toBeVisible();
// A non-EQUAL split forces the split row open — its toggle is disabled.
await expect(page.getByTestId('expense-split-row')).toBeDisabled();

const inputs = page.getByTestId('per-member-inputs').locator('input');
await inputs.nth(0).fill('0');
await inputs.nth(1).fill('100');
await page.getByTestId('add-expense-submit').click();
await expect(page.getByRole('dialog')).toBeHidden();

// Reopening starts from clean defaults — the split row is collapsed again and
// the currency is back to base.
await page.getByTestId('add-expense-open').click();
await expect(page.getByRole('dialog')).toBeVisible();
await expect(page.getByTestId('split-type-EXACT')).toHaveCount(0);
await expect(page.getByTestId('expense-currency-select')).toHaveValue('CZK');
```

**OCR test** — the scan entry point moves inside the expense sheet:

```ts
await page.getByTestId('add-expense-open').click();
await page.getByTestId('expense-receipt-row').click();
await page.getByTestId('ocr-file-input').setInputFiles({ … unchanged … });
```

(The rest of the OCR flow — items, chips, totals, `ocr-save-btn`, hidden `ocr-items`, `view-receipt` — is unchanged.)

Run to confirm RED:

```bash
pnpm --filter @evenup/web test:e2e
```

- [ ] **Step 2: Reshape `ocr-scan.tsx`**

Three small edits, everything else stays:

1. Props: add `onSaved`:

```tsx
export function OcrScan({
  groupId,
  members,
  baseCurrency,
  onSaved,
}: {
  groupId: string;
  members: MemberLite[];
  baseCurrency: string;
  onSaved?: () => void;
}) {
```

2. In the `createExpense` mutation's `onSuccess` (which currently resets items/state), append `onSaved?.();` as the last line.

3. Replace the outer wrapper `<Card><h3 className="mb-3 font-semibold">{t('ocr.scan')}</h3>` and its closing `</Card>` with `<div>` / `</div>` (the Sheet title carries "Scan receipt"); remove the `Card` import.

- [ ] **Step 3: Rewrite `add-expense-form.tsx`**

Keep ALL existing state, the FX `useEffect`, and `submit()` **verbatim** except: add `date` state wired into `common.date`, add `ocrOpen` + `openRow` state, and reset them on success. Full new render section:

```tsx
'use client';
import { useEffect, useState } from 'react';
import {
  decimalStringToMinor,
  splitEqually,
  EXPENSE_CATEGORIES,
  RECURRENCE_INTERVALS,
} from '@evenup/core';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import type { MessageKey } from '@evenup/i18n';
import { Button, Input, Label, SectionLabel } from '@/components/ui';
import { AmountText } from '@/components/amount-text';
import { MemberChip } from '@/components/member-chip';
import { Sheet } from '@/components/sheet';
import { Fab } from '@/components/fab';
import { OcrScan } from '@/components/ocr-scan';
import { CategoryIcon, Camera, ChevronDown } from '@/components/icons';

// …MemberLite, SplitType, SPLIT_LABELS, RecurrenceValue, RECURRENCE_VALUES and
// the Segmented component stay EXACTLY as they are today (copy verbatim)…

type Row = 'split' | 'category' | 'date' | 'repeat' | null;

/** Collapsible settings row inside the expense sheet (Split / Category / Date / Repeat). */
function DisclosureRow({
  label,
  value,
  open,
  disabled,
  onToggle,
  testId,
  children,
}: {
  label: string;
  value: React.ReactNode;
  open: boolean;
  disabled?: boolean;
  onToggle: () => void;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-zinc-100 dark:border-zinc-800">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        disabled={disabled}
        data-testid={testId}
        className="flex w-full items-center justify-between py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:cursor-not-allowed"
      >
        <span className="text-zinc-600 dark:text-zinc-300">{label}</span>
        <span className="flex items-center gap-1 font-semibold text-brand-600 dark:text-brand-100">
          {value}
          <ChevronDown
            size={16}
            aria-hidden
            className={`transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </span>
      </button>
      {open ? <div className="pb-3">{children}</div> : null}
    </div>
  );
}

export function AddExpenseForm({ groupId, members, baseCurrency }: { … same props … }) {
  // …all existing state hooks verbatim, PLUS:
  const [openRow, setOpenRow] = useState<Row>(null);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  // In createExpense.onSuccess, the reset block additionally sets:
  //   setOpenRow(null);
  //   setDate(new Date().toISOString().slice(0, 10));
  // In submit()'s `common` object, `date: new Date()` becomes `date: new Date(date)`.
  //
  // DELETE the old progressive-disclosure machinery — it is fully replaced by
  // openRow/splitForced/splitOpen below and would fail lint as unused:
  //   const [showAdvanced, setShowAdvanced] = useState(false);
  //   const requiresAdvanced = …;  const advancedOpen = …;
  //   …and the `setShowAdvanced(false)` line inside the onSuccess reset.

  // A non-EQUAL split's per-member inputs must stay reachable: force the split
  // row open and disable its toggle (mirrors today's requiresAdvanced rule).
  const splitForced = splitType !== 'EQUAL';
  const splitOpen = openRow === 'split' || splitForced;

  // Live equal-split preview per selected member (cent-accurate via core).
  let shares: Record<string, number> = {};
  if (splitType === 'EQUAL' && selectedMembers.length > 0) {
    try {
      const total = decimalStringToMinor(amount || '0', currency);
      if (total > 0) {
        shares = Object.fromEntries(
          splitEqually(total, selectedMembers.map((m) => ({ memberId: m.id }))).map((s) => [
            s.memberId,
            s.computedMinorUnits,
          ]),
        );
      }
    } catch {
      // ignore preview errors while the user is typing
    }
  }

  const toggleRow = (row: Exclude<Row, null>) => setOpenRow((r) => (r === row ? null : row));
  const categoryLabel = t(`category.${category}` as MessageKey);

  return (
    <>
      <Fab onClick={() => setOpen(true)} aria-label={t('expense.add')} data-testid="add-expense-open" />

      <Sheet open={open} onClose={() => setOpen(false)} title={t('expense.add')} testId="add-expense-modal">
        <form className="space-y-4" onSubmit={submit}>
          {/* Amount first */}
          <div className="flex items-end justify-center gap-2">
            <input
              id="e-amount"
              inputMode="decimal"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              disabled={splitType === 'EXACT'}
              required={splitType !== 'EXACT'}
              aria-label={t('expense.amount')}
              data-testid="expense-amount-input"
              className="w-40 bg-transparent text-center text-4xl font-extrabold tabular-nums text-zinc-900 outline-none placeholder:text-zinc-300 disabled:opacity-40 dark:text-zinc-100 dark:placeholder:text-zinc-600"
            />
            <select
              value={currency}
              onChange={(e) => {
                setCurrency(e.target.value);
                setFxRate('');
              }}
              aria-label={t('expense.currency')}
              data-testid="expense-currency-select"
              className="mb-1.5 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm font-medium outline-none focus:border-brand-500 dark:border-zinc-700 dark:bg-zinc-800"
            >
              {[baseCurrency, 'CZK', 'EUR', 'USD', 'GBP', 'PLN']
                .filter((c, i, arr) => arr.indexOf(c) === i)
                .map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
            </select>
          </div>

          {/* FX rate, only for a foreign currency (kept next to the amount) */}
          {currency !== baseCurrency ? (
            <div className="mx-auto max-w-xs">
              <Label htmlFor="e-fx">{`${t('fx.rate')} → ${baseCurrency}`}</Label>
              <Input
                id="e-fx"
                inputMode="decimal"
                value={fxRate}
                onChange={(e) => setFxRate(e.target.value)}
                placeholder="24.5"
                required
                data-testid="expense-fx-input"
              />
              {fxResolve.data ? (
                <p className="mt-1 text-xs text-zinc-400" data-testid="fx-source">
                  {fxResolve.data.stale
                    ? t('fx.stale')
                    : fxResolve.data.source === 'frankfurter'
                      ? `${t('fx.rate')} · Frankfurter`
                      : t('fx.override')}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Title */}
          <input
            id="e-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder={t('expense.title')}
            aria-label={t('expense.title')}
            data-testid="expense-title-input"
            className="w-full border-b border-zinc-100 bg-transparent pb-2 text-center text-sm outline-none placeholder:text-zinc-400 focus:border-brand-500 dark:border-zinc-800"
          />

          {/* Paid by — chips exactly as today (radiogroup, payer-chip-<id> testids) */}
          <div>
            <SectionLabel>{t('expense.paidBy')}</SectionLabel>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('expense.paidBy')}>
              {members.map((m) => {
                const selected = payerId === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setPayerId(m.id)}
                    data-testid={`payer-chip-${m.id}`}
                    className={`inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
                      selected
                        ? 'border-brand-600 bg-brand-50 font-medium text-brand-700 dark:bg-brand-600/20 dark:text-brand-100'
                        : 'border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <MemberChip initials={m.initials} color={m.color} name={m.displayName} size="sm" />
                    {m.displayName}
                  </button>
                );
              })}
            </div>
          </div>

          {/* For whom — toggle chips with a live equal-share preview */}
          <div>
            <SectionLabel>{t('expense.splitBetween')}</SectionLabel>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('expense.splitBetween')}>
              {members.map((m) => {
                const selected = isSelected(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggle(m.id)}
                    className={`inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
                      selected
                        ? 'border-brand-600 bg-brand-50 font-medium text-brand-700 dark:bg-brand-600/20 dark:text-brand-100'
                        : 'border-zinc-200 opacity-60 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <MemberChip initials={m.initials} color={m.color} name={m.displayName} size="sm" />
                    {m.displayName}
                    {selected && shares[m.id] != null ? (
                      <AmountText
                        minorUnits={shares[m.id]!}
                        currency={currency}
                        className="text-xs text-zinc-400"
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Collapsed settings rows */}
          <div className="border-t border-zinc-100 dark:border-zinc-800">
            <DisclosureRow
              label={t('expense.splitBetween')}
              value={t(SPLIT_LABELS[splitType])}
              open={splitOpen}
              disabled={splitForced}
              onToggle={() => toggleRow('split')}
              testId="expense-split-row"
            >
              <div className="space-y-3">
                <Segmented
                  ariaLabel={t('expense.splitBetween')}
                  value={splitType}
                  onChange={(v) => setSplitType(v as SplitType)}
                  testIdPrefix="split-type"
                  options={(Object.keys(SPLIT_LABELS) as SplitType[]).map((st) => ({
                    value: st,
                    label: t(SPLIT_LABELS[st]),
                  }))}
                />
                {splitType !== 'EQUAL' ? (
                  <div className="space-y-2" data-testid="per-member-inputs">
                    {selectedMembers.map((m) => (
                      <div key={m.id} className="flex items-center gap-2">
                        <MemberChip initials={m.initials} color={m.color} name={m.displayName} size="sm" />
                        <span className="flex-1 text-sm">{m.displayName}</span>
                        <div className="w-28">
                          <Input
                            inputMode="decimal"
                            aria-label={`${m.displayName} ${perMemberLabel}`}
                            placeholder={perMemberLabel}
                            value={values[m.id] ?? ''}
                            onChange={(e) => setValues((v) => ({ ...v, [m.id]: e.target.value }))}
                            data-testid={`member-value-${m.id}`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </DisclosureRow>

            <DisclosureRow
              label={t('expense.category')}
              value={
                <span className="flex items-center gap-1.5">
                  <CategoryIcon name={EXPENSE_CATEGORIES.find((c) => c.key === category)?.iconName ?? 'package'} />
                  {categoryLabel}
                </span>
              }
              open={openRow === 'category'}
              onToggle={() => toggleRow('category')}
              testId="expense-category-row"
            >
              <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label={t('expense.category')}>
                {EXPENSE_CATEGORIES.map((c) => {
                  const label = t(`category.${c.key}` as never);
                  const selected = category === c.key;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setCategory(c.key)}
                      title={label}
                      data-testid={`category-chip-${c.key}`}
                      className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
                        selected
                          ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-600/20 dark:text-brand-100'
                          : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <CategoryIcon name={c.iconName} size={20} />
                      <span className="text-[10px] leading-tight">{label}</span>
                    </button>
                  );
                })}
              </div>
            </DisclosureRow>

            <DisclosureRow
              label={t('expense.date')}
              value={date}
              open={openRow === 'date'}
              onToggle={() => toggleRow('date')}
              testId="expense-date-row"
            >
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label={t('expense.date')}
                data-testid="expense-date-input"
              />
            </DisclosureRow>

            <DisclosureRow
              label={t('expense.recurring')}
              value={recurrence === 'none' ? t('recurrence.none') : t(`recurrence.${recurrence}` as never)}
              open={openRow === 'repeat'}
              onToggle={() => toggleRow('repeat')}
              testId="expense-repeat-row"
            >
              <Segmented
                ariaLabel={t('expense.recurring')}
                value={recurrence}
                onChange={(v) => setRecurrence(v as RecurrenceValue)}
                testIdPrefix="recurrence"
                options={RECURRENCE_VALUES.map((r) => ({
                  value: r,
                  label: r === 'none' ? t('recurrence.none') : t(`recurrence.${r}` as never),
                }))}
              />
            </DisclosureRow>

            {/* Receipt scan — opens the OCR flow in its own sheet */}
            <button
              type="button"
              onClick={() => setOcrOpen(true)}
              data-testid="expense-receipt-row"
              className="flex w-full items-center justify-between py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              <span className="text-zinc-600 dark:text-zinc-300">{t('ocr.scan')}</span>
              <Camera size={16} aria-hidden className="text-brand-600 dark:text-brand-100" />
            </button>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {error}
            </p>
          ) : null}

          <div className="sticky bottom-0 -mx-5 border-t border-zinc-100 bg-white px-5 pb-1 pt-3 dark:border-zinc-800 dark:bg-zinc-900">
            <Button type="submit" disabled={createExpense.isPending} className="w-full" data-testid="add-expense-submit">
              {createExpense.isPending ? t('common.loading') : t('common.save')}
            </Button>
          </div>
        </form>
      </Sheet>

      {/* OCR flow in its own sheet, stacked above the expense sheet */}
      <Sheet open={ocrOpen} onClose={() => setOcrOpen(false)} title={t('ocr.scan')}>
        <OcrScan
          groupId={groupId}
          members={members}
          baseCurrency={baseCurrency}
          onSaved={() => {
            setOcrOpen(false);
            setOpen(false);
          }}
        />
      </Sheet>
    </>
  );
}
```

`t('expense.date')` — check it exists (`grep "'expense.date'" packages/i18n/src/locales/cs.ts`); if missing, add `'expense.date': 'Datum'` (cs) / `'Date'` (en) alongside the Task 5 keys.

- [ ] **Step 4: Remove the standalone OCR card from `group-detail.tsx`**

Delete the `<OcrScan …/>` element and its import — the FAB + expense sheet (rendered by `AddExpenseForm`) is now the only entry point. Keep the `activeMembers.length > 0` guard around `<AddExpenseForm …/>`.

- [ ] **Step 5: Run e2e (GREEN), lint/typecheck, commit**

```bash
pnpm --filter @evenup/web lint && pnpm --filter @evenup/web typecheck
pnpm --filter @evenup/web test:e2e
git add -A apps/web
git commit -m "feat(web): amount-first expense sheet behind a FAB, OCR scan inside"
```

---

### Task 7: Groups dashboard — cards, AvatarStack, create-group sheet

**Files:**

- Modify: `apps/web/src/components/groups-dashboard.tsx` (full rewrite below)

**Interfaces:**

- Consumes: `Fab`, `Sheet` (Task 3), `AvatarStack` (Task 2), existing `trpc.group.list/create`.
- Preserved testids/names: `new-group-btn` (now the FAB, accessible name still `t('group.create')` via aria-label — the language-switch e2e asserts this name), `group-name-input`, `create-group-submit`.

- [ ] **Step 1: Rewrite `groups-dashboard.tsx`**

```tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Button, Card, EmptyState, Input, Label, Select } from '@/components/ui';
import { AvatarStack } from '@/components/member-chip';
import { Sheet } from '@/components/sheet';
import { Fab } from '@/components/fab';
import { Users } from '@/components/icons';

const TEMPLATES = ['TRIP', 'HOUSEHOLD', 'COUPLE', 'EVENT', 'OTHER'] as const;
const CURRENCIES = ['CZK', 'EUR', 'USD', 'GBP', 'PLN'] as const;

export function GroupsDashboard() {
  const { t } = useI18n();
  const utils = trpc.useUtils();
  const groups = trpc.group.list.useQuery();
  const createGroup = trpc.group.create.useMutation({
    onSuccess: () => {
      void utils.group.list.invalidate();
      setOpen(false);
      setName('');
    },
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState<(typeof TEMPLATES)[number]>('TRIP');
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>('CZK');

  return (
    <div className="space-y-4 pb-24">
      <h1 className="text-2xl font-extrabold tracking-tight">{t('nav.groups')}</h1>

      {groups.isLoading ? (
        <p className="text-zinc-400">{t('common.loading')}</p>
      ) : groups.data && groups.data.length > 0 ? (
        <ul className="space-y-3">
          {groups.data.map((g) => (
            <li key={g.id}>
              <Link href={`/groups/${g.id}`} className="block">
                <Card className="flex items-center gap-3 transition-colors hover:border-zinc-300 dark:hover:border-zinc-700">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold tracking-tight">{g.name}</p>
                    <p className="text-xs text-zinc-400">
                      {g._count.transactions} · {g.baseCurrency}
                    </p>
                  </div>
                  <AvatarStack
                    members={g.members.map((m) => ({
                      id: m.id,
                      initials: m.initials,
                      color: m.color,
                      displayName: m.displayName,
                    }))}
                  />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Card>
          <EmptyState icon={<Users size={28} aria-hidden />} title={t('group.empty')} />
        </Card>
      )}

      <Fab
        onClick={() => setOpen(true)}
        aria-label={t('group.create')}
        data-testid="new-group-btn"
      />

      <Sheet open={open} onClose={() => setOpen(false)} title={t('group.create')}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            createGroup.mutate({ name, template, baseCurrency: currency });
          }}
        >
          <div>
            <Label htmlFor="g-name">{t('group.name')}</Label>
            <Input
              id="g-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              data-testid="group-name-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="g-template">{t('group.template')}</Label>
              <Select
                id="g-template"
                value={template}
                onChange={(e) => setTemplate(e.target.value as (typeof TEMPLATES)[number])}
              >
                {TEMPLATES.map((tpl) => (
                  <option key={tpl} value={tpl}>
                    {t(`group.template.${tpl.toLowerCase()}` as never)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="g-currency">{t('group.baseCurrency')}</Label>
              <Select
                id="g-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as (typeof CURRENCIES)[number])}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={createGroup.isPending}
            data-testid="create-group-submit"
          >
            {createGroup.isPending ? t('common.loading') : t('common.save')}
          </Button>
        </form>
      </Sheet>
    </div>
  );
}
```

Note: `g.members` in `group.list` — confirm the fields with `pnpm --filter @evenup/web typecheck`; the current dashboard already maps `g.members.slice(0, 5)` with `initials`/`color`/`displayName`, so the data is available.

- [ ] **Step 2: Run e2e (dashboard flows must stay green), commit**

```bash
pnpm --filter @evenup/web lint && pnpm --filter @evenup/web typecheck
pnpm --filter @evenup/web test:e2e
git add apps/web/src/components/groups-dashboard.tsx
git commit -m "feat(web): dashboard group cards with avatar stacks + create-group sheet"
```

---

### Task 8: Header wordmark, sign-in restyle, secondary-page token pass

**Files:**

- Modify: `apps/web/src/components/header.tsx` (full rewrite below)
- Modify: `apps/web/src/components/sign-in.tsx` (restyle; logic untouched)
- Modify: `apps/web/src/app/settings/page.tsx`, `apps/web/src/app/admin/page.tsx`, `apps/web/src/app/invite/[token]/page.tsx` (mechanical class pass)

**Interfaces:**

- Consumes: `GoogleLogo`/`AppleLogo`/`Settings`/`LogOut` icons (Task 2).
- Preserved: `nav-admin` testid; the settings link's accessible name must keep matching `/settings|nastavení/i` (e2e OCR test); the language-toggle buttons `CS`/`EN` keep their behavior; env-flag gating of OAuth buttons unchanged.

- [ ] **Step 1: Rewrite `header.tsx`**

```tsx
'use client';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { useSession, signOut } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { iconButtonClass } from '@/components/ui';
import { Settings, LogOut } from '@/components/icons';

export function Header() {
  const { t, locale, setLocale } = useI18n();
  const { data: session } = useSession();
  const me = trpc.user.me.useQuery(undefined, { enabled: !!session?.user });

  return (
    <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
        <Link
          href="/"
          aria-label={t('app.name')}
          className="text-lg font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100"
        >
          Even<span className="text-brand-600">Up</span>
        </Link>
        <nav className="flex items-center gap-1.5">
          <div
            className="flex overflow-hidden rounded-lg border border-zinc-200 text-xs dark:border-zinc-700"
            role="group"
            aria-label="Language"
          >
            {(['cs', 'en'] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLocale(l)}
                aria-pressed={locale === l}
                className={`px-2 py-1 font-medium uppercase ${
                  locale === l
                    ? 'bg-brand-600 text-white'
                    : 'bg-white text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          {session?.user ? (
            <>
              {me.data?.isAdmin ? (
                <Link
                  href="/admin"
                  className="text-sm font-medium text-brand-600 dark:text-brand-100"
                  data-testid="nav-admin"
                >
                  {t('nav.admin')}
                </Link>
              ) : null}
              <Link
                href="/settings"
                aria-label={t('nav.settings')}
                title={t('nav.settings')}
                className={iconButtonClass}
              >
                <Settings size={18} aria-hidden />
              </Link>
              <button
                type="button"
                onClick={() => signOut()}
                aria-label={t('nav.signOut')}
                title={t('nav.signOut')}
                className={iconButtonClass}
              >
                <LogOut size={18} aria-hidden />
              </button>
            </>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Restyle `sign-in.tsx`**

Keep the whole component logic (state, `submit`, env flags, testids) — change only the JSX shell:

- The heading block becomes:

```tsx
<div className="mb-6 text-center">
  <h1 className="text-3xl font-extrabold tracking-tight" aria-label={t('app.name')}>
    Even<span className="text-brand-600">Up</span>
  </h1>
  <p className="mt-1 text-sm text-zinc-400">{t('app.tagline')}</p>
</div>
```

- The Google button gets the brand mark (import `GoogleLogo` from icons, switch variant):

```tsx
<Button
  type="button"
  variant="secondary"
  className="flex w-full items-center justify-center gap-2"
  onClick={() => signIn.social({ provider: 'google', callbackURL: '/' })}
  data-testid="google-signin"
>
  <GoogleLogo size={16} />
  {t('auth.continueGoogle')}
</Button>
```

- The Apple button switches `variant="ghost"` → `variant="secondary"` (it already renders `<AppleLogo size={16} />`).

- [ ] **Step 3: Token pass over settings / admin / invite pages**

These pages already build on `Card`/`Button`/`Input`/`Select` (which Task 1 restyled) and the Task 1 sweep converted their grays. Sweep the leftovers:

```bash
grep -n 'rounded-lg\|shadow-md\|shadow-sm\|font-bold' \
  apps/web/src/app/settings/page.tsx apps/web/src/app/admin/page.tsx \
  'apps/web/src/app/invite/[token]/page.tsx'
```

Apply this mapping to every hit (leave semantics alone):

| Old                                        | New                                      |
| ------------------------------------------ | ---------------------------------------- |
| `rounded-lg` (inputs/buttons)              | `rounded-xl`                             |
| `shadow-sm` / `shadow-md` on cards         | _(delete — hairline borders only)_       |
| page `<h1 className="text-2xl font-bold">` | `text-2xl font-extrabold tracking-tight` |

- [ ] **Step 4: Run e2e (admin + settings + invite + language tests), commit**

```bash
pnpm --filter @evenup/web lint && pnpm --filter @evenup/web typecheck
pnpm --filter @evenup/web test:e2e
git add -A apps/web/src
git commit -m "feat(web): wordmark header, restyled sign-in with brand logos, secondary-page token pass"
```

---

### Task 9: Full verification pass

**Files:**

- Modify: only what the checks below surface.

- [ ] **Step 1: Full pipeline**

```bash
pnpm --filter @evenup/web lint
pnpm --filter @evenup/web typecheck
pnpm --filter @evenup/web test        # server vitest suite
pnpm --filter @evenup/web build
pnpm --filter @evenup/web test:e2e    # full Playwright suite incl. axe wcag2a/aa checks
```

Expected: everything PASS. Fix any fallout where it occurs (do not weaken assertions or axe tags).

- [ ] **Step 2: Amount-wrapping regression check**

Append to `critical-flow.spec.ts` inside the describe block:

```ts
test('large amounts never wrap (design-spec hard rule)', async ({ page }, testInfo) => {
  const email = uniqueEmail('wrap', testInfo.workerIndex + Date.now());
  await signIn(page, email);

  await page.getByTestId('new-group-btn').click();
  await page.getByTestId('group-name-input').fill('Wrap');
  await page.getByTestId('create-group-submit').click();
  await page.getByText('Wrap').click();

  await openGroupSheet(page, 'members');
  await page.getByTestId('member-name-input').fill('Petr');
  await page.getByTestId('add-member-btn').click();
  await expect(page.getByRole('img', { name: 'Petr' }).first()).toBeVisible();
  await closeSheet(page);

  await page.getByTestId('add-expense-open').click();
  await page.getByTestId('expense-amount-input').fill('1234567.89');
  await page.getByTestId('expense-title-input').fill('Mega');
  await page.getByTestId('add-expense-submit').click();

  // Every settle amount renders on a single line even at phone width.
  await page.setViewportSize({ width: 390, height: 844 });
  const amount = page.getByTestId('payments-list').locator('span.tabular-nums').first();
  const box = await amount.boundingBox();
  expect(box).not.toBeNull();
  const lineHeight = await amount.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
  expect(box!.height).toBeLessThan(lineHeight * 1.5);
});
```

Run it: `pnpm --filter @evenup/web test:e2e -- --grep "never wrap"` → PASS.

- [ ] **Step 3: Manual visual pass (dev server)**

```bash
pnpm --filter @evenup/web dev
```

Check at 390 px width and desktop, light and dark (`prefers-color-scheme`): dashboard, group page (settle rows, bars, transactions), expense sheet (amount focus, chips, rows), menu sheets, sign-in. Fix any spacing/contrast issues found.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "test(web): amount no-wrap regression + redesign verification pass"
```
