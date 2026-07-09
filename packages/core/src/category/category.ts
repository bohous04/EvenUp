/**
 * Expense categories and spend aggregation (PRD FR-12.2). Category keys are
 * stable identifiers; the human-readable label comes from `@evenup/i18n`. The
 * `iconName` is a semantic, platform-agnostic name (lucide kebab-case) that each
 * client maps to an SVG icon component — core never stores emoji.
 */

export interface ExpenseCategory {
  readonly key: string;
  readonly iconName: string;
}

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  { key: 'groceries', iconName: 'shopping-cart' },
  { key: 'restaurant', iconName: 'utensils' },
  { key: 'transport', iconName: 'car' },
  { key: 'accommodation', iconName: 'house' },
  { key: 'entertainment', iconName: 'ticket' },
  { key: 'shopping', iconName: 'shopping-bag' },
  { key: 'utilities', iconName: 'lightbulb' },
  { key: 'health', iconName: 'pill' },
  { key: 'travel', iconName: 'plane' },
  { key: 'other', iconName: 'package' },
] as const;

const BY_KEY = new Map(EXPENSE_CATEGORIES.map((c) => [c.key, c]));
const OTHER = EXPENSE_CATEGORIES.find((c) => c.key === 'other')!;

export function isExpenseCategory(value: string): boolean {
  return BY_KEY.has(value);
}

/** Curated icon names selectable for custom categories (clients map to SVG). */
export const CUSTOM_CATEGORY_ICONS: readonly string[] = [
  ...EXPENSE_CATEGORIES.map((c) => c.iconName),
  'dog',
  'gift',
  'coffee',
  'dumbbell',
  'music',
  'wrench',
  'fuel',
  'baby',
  'gamepad-2',
  'beer',
];

/** Group-scoped custom categories are referenced as `custom:<cuid>`. */
export function isCustomCategoryKey(key: string): boolean {
  return /^custom:[a-z0-9]+$/.test(key);
}

/** Semantic icon name for a category key, defaulting to the "other" icon. */
export function categoryIcon(key: string | null | undefined): string {
  return (key ? BY_KEY.get(key) : undefined)?.iconName ?? OTHER.iconName;
}

export interface Categorizable {
  readonly type: 'expense' | 'income' | 'transfer';
  readonly category?: string | null;
  readonly baseMinorUnits: number;
}

export interface CategorySummary {
  readonly category: string;
  readonly totalMinorUnits: number;
  readonly count: number;
}

/**
 * Aggregate spend per category (base minor units), counting expenses and income
 * (income reduces the bucket) and ignoring transfers. Sorted by total
 * descending, ties broken by category key.
 */
export function summarizeByCategory(
  transactions: readonly Categorizable[],
  opts?: { customKeys?: ReadonlySet<string> },
): CategorySummary[] {
  const customKeys = opts?.customKeys;
  const totals = new Map<string, { total: number; count: number }>();
  for (const txn of transactions) {
    if (txn.type === 'transfer') continue;
    const key =
      txn.category && (isExpenseCategory(txn.category) || customKeys?.has(txn.category))
        ? txn.category
        : 'other';
    const bucket = totals.get(key) ?? { total: 0, count: 0 };
    bucket.total += txn.baseMinorUnits;
    bucket.count += 1;
    totals.set(key, bucket);
  }

  return [...totals.entries()]
    .map(([category, { total, count }]) => ({ category, totalMinorUnits: total, count }))
    .sort((a, b) =>
      b.totalMinorUnits !== a.totalMinorUnits
        ? b.totalMinorUnits - a.totalMinorUnits
        : a.category < b.category
          ? -1
          : 1,
    );
}
