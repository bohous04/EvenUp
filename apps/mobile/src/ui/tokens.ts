/**
 * Design tokens, kept in lockstep with the web app.
 *
 * Colours, radii and the type hierarchy are copied verbatim from
 * `apps/web/src/app/globals.css` (`@theme` brand ramp) and the stock Tailwind
 * `zinc` scale the web kit is built on — so both platforms read as one product.
 *
 * Sizing is deliberately *not* copied. Web controls are 36–38px tall with 14px
 * text; on iOS that lands under Apple's 44pt minimum target and 14px inputs
 * trigger Safari/WebView zoom-on-focus. Everything in `control` and `type.body`
 * is scaled up to native norms instead.
 */

/** The web `@theme` brand ramp — Tailwind indigo. */
const brandRamp = {
  brand50: '#eef2ff',
  brand100: '#e0e7ff',
  brand500: '#6366f1',
  brand600: '#4f46e5',
  brand700: '#4338ca',
} as const;

export interface ThemeColors {
  /** Primary action / accent — `brand-600` on both schemes (web never overrides it). */
  brand: string;
  /** Brand ramp, for tinted surfaces and pressed states. */
  brand50: string;
  brand100: string;
  brand500: string;
  brand600: string;
  brand700: string;
  /**
   * Brand-coloured *text* (links, selected chip labels). Web flips this to
   * `brand-100` in dark mode — `brand-600` on `zinc-950` is unreadable.
   */
  brandText: string;
  /**
   * Brand text on a *tinted* surface (selected chips, disclosure values) —
   * web `text-brand-700` / `dark:text-brand-100`. A step darker than
   * `brandText` so it holds up against `brandSurface`.
   */
  brandTextStrong: string;
  /** Selected-chip / category-tile fill — web `bg-brand-50` / `dark:bg-brand-600/20`. */
  brandSurface: string;
  /** Pressed/hover tint behind ghost buttons and list rows — web `bg-brand-600/10`. */
  brandTint: string;

  bg: string;
  card: string;
  /** Input fill. White on light, `zinc-800` on dark (web `dark:bg-zinc-800`). */
  inputBg: string;

  text: string;
  /** Form labels — `zinc-700` / `zinc-300`. */
  textSecondary: string;
  /** Meta lines, taglines — `zinc-500` / `zinc-400`. */
  textMuted: string;
  /** Icon chrome, empty-state glyphs — `zinc-400` / `zinc-600`. */
  textFaint: string;

  border: string;
  /** Input border — `zinc-200` / `zinc-700` (a step lighter than `border` on dark). */
  borderInput: string;
  /** Hairlines *inside* cards — `zinc-100` / `zinc-800`. */
  divider: string;
  /** Progress/balance-bar track — `zinc-100` / `zinc-800`. */
  track: string;
  /** Row press feedback — `zinc-50` / `zinc-800`. */
  rowPressed: string;

  /**
   * Positive amounts. `green-700` on light, not `green-600`: green-600 on white
   * is 3.2:1 and fails WCAG AA for 14px normal weight (see
   * `apps/web/src/components/amount-text.tsx`).
   */
  green: string;
  /** Negative amounts — `red-600` / `red-400`. */
  red: string;
  /** Destructive button fill — `red-600` on both schemes. */
  danger: string;
  /** Destructive button pressed fill — web `hover:bg-red-700`. */
  dangerPressed: string;
  /** Error message text — `red-700` / `red-400`. */
  dangerText: string;
  /** Balance-bar fills, same on both schemes. */
  barPositive: string;
  barNegative: string;

  amberBg: string;
  amberText: string;

  overlay: string;
  /** Foreground on a filled brand/danger surface. */
  onBrand: string;
}

/** Web's radius scale: `rounded-md`/`lg`/`xl`/`2xl`/`full`. */
export const radii = {
  /** 6 — segmented-control inner buttons. */
  sm: 6,
  /** 8 — segmented container, selects, code blocks. */
  md: 8,
  /** 12 — buttons, inputs, tappable rows, category tiles. */
  lg: 12,
  /** 16 — cards, sheets, modals. */
  xl: 16,
  /** Pills, avatars, FAB, grab handles. */
  full: 999,
} as const;

/** 4px base, matching Tailwind's `--spacing: 0.25rem`. Keys are Tailwind steps. */
export const spacing = {
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  2.5: 10,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  12: 48,
  /** Bottom padding that keeps the FAB clear of the last row (web `pb-24`). */
  24: 96,
} as const;

/**
 * Type hierarchy mirroring web's scale.
 *
 * `letterSpacing` is points here, not em — web's `tracking-tight` (-0.025em) and
 * `tracking-widest` (0.1em) are pre-multiplied by each size.
 */
export const type = {
  /** Auth wordmark — web `text-3xl font-extrabold tracking-tight`. */
  wordmark: { fontSize: 30, fontWeight: '800', letterSpacing: -0.75 },
  /** Page titles — web `text-2xl font-extrabold tracking-tight`. */
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.6 },
  /** Sheet/modal titles — web `text-lg font-bold tracking-tight`. */
  sheetTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.45 },
  /** Hero amount in the expense form — web `text-4xl font-extrabold`. */
  amount: { fontSize: 36, fontWeight: '800', letterSpacing: -0.9 },
  /** Body / control text. Web uses 14; 16 here to avoid iOS zoom-on-focus. */
  body: { fontSize: 16, fontWeight: '400' },
  bodyMedium: { fontSize: 16, fontWeight: '500' },
  bodySemibold: { fontSize: 16, fontWeight: '600' },
  bodyBold: { fontSize: 16, fontWeight: '700' },
  /** Form labels — web `text-sm font-medium`. */
  label: { fontSize: 14, fontWeight: '500' },
  /** List meta lines. Web `text-xs` (12); nudged to 13 for native legibility. */
  meta: { fontSize: 13, fontWeight: '400' },
  caption: { fontSize: 12, fontWeight: '400' },
  /** `SectionLabel` — web `text-[11px] font-semibold uppercase tracking-widest`. */
  section: { fontSize: 11, fontWeight: '600', letterSpacing: 1.1 },
} as const;

/**
 * Native control metrics. These intentionally diverge from web (36/38px) to
 * clear Apple's 44pt minimum touch target.
 */
export const control = {
  /** Button height — web 36. */
  height: 48,
  /** Input height — web 38. */
  inputHeight: 48,
  paddingX: 16,
  inputPaddingX: 12,
  /** Circular icon button — web `h-9 w-9` (36). */
  iconButton: 40,
  /** FAB — web `h-14 w-14`. */
  fab: 56,
  /** Hairline. RN rounds sub-pixel widths oddly, so 1 is safest. */
  hairline: 1,
} as const;

export interface ThemeTokens extends ThemeColors {
  radii: typeof radii;
  spacing: typeof spacing;
  type: typeof type;
  control: typeof control;
  /**
   * @deprecated Legacy flat scalars kept so un-migrated screens keep compiling.
   * Use `radii.*` / `spacing.*` instead.
   */
  radius: number;
  /** @deprecated Use `spacing[4]`. */
  space: number;
}

const shared = { radii, spacing, type, control, radius: radii.lg, space: spacing[4] };

export const lightTokens: ThemeTokens = {
  ...brandRamp,
  brand: brandRamp.brand600,
  brandText: brandRamp.brand600,
  brandTextStrong: brandRamp.brand700,
  brandSurface: brandRamp.brand50,
  brandTint: brandRamp.brand50,

  bg: '#fafafa', // zinc-50
  card: '#ffffff',
  inputBg: '#ffffff',

  text: '#18181b', // zinc-900
  textSecondary: '#3f3f46', // zinc-700
  textMuted: '#71717a', // zinc-500
  textFaint: '#a1a1aa', // zinc-400

  border: '#e4e4e7', // zinc-200
  borderInput: '#e4e4e7', // zinc-200
  divider: '#f4f4f5', // zinc-100
  track: '#f4f4f5', // zinc-100
  rowPressed: '#fafafa', // zinc-50

  green: '#15803d', // green-700
  red: '#dc2626', // red-600
  danger: '#dc2626', // red-600
  dangerPressed: '#b91c1c', // red-700
  dangerText: '#b91c1c', // red-700
  barPositive: '#4ade80', // green-400
  barNegative: '#f87171', // red-400

  amberBg: '#fef3c7', // amber-100
  amberText: '#92400e', // amber-800

  overlay: 'rgba(0,0,0,0.4)',
  onBrand: '#ffffff',
  ...shared,
};

export const darkTokens: ThemeTokens = {
  ...brandRamp,
  brand: brandRamp.brand600,
  brandText: brandRamp.brand100,
  brandTextStrong: brandRamp.brand100,
  brandSurface: 'rgba(79,70,229,0.20)', // web `dark:bg-brand-600/20`
  brandTint: 'rgba(79,70,229,0.10)', // web `dark:hover:bg-brand-600/10`

  bg: '#09090b', // zinc-950
  card: '#18181b', // zinc-900
  inputBg: '#27272a', // zinc-800

  text: '#f4f4f5', // zinc-100
  textSecondary: '#d4d4d8', // zinc-300
  textMuted: '#a1a1aa', // zinc-400
  textFaint: '#71717a', // zinc-500

  border: '#27272a', // zinc-800
  borderInput: '#3f3f46', // zinc-700
  divider: '#27272a', // zinc-800
  track: '#27272a', // zinc-800
  rowPressed: '#27272a', // zinc-800

  green: '#4ade80', // green-400
  red: '#f87171', // red-400
  danger: '#dc2626', // red-600 — web keeps the same fill on dark
  dangerPressed: '#b91c1c', // red-700
  dangerText: '#f87171', // red-400
  barPositive: '#4ade80',
  barNegative: '#f87171',

  amberBg: 'rgba(245,158,11,0.20)', // amber-500/20
  amberText: '#fcd34d', // amber-300

  overlay: 'rgba(0,0,0,0.6)',
  onBrand: '#ffffff',
  ...shared,
};
