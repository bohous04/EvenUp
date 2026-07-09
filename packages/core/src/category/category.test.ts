import { describe, expect, test } from 'vitest';
import {
  EXPENSE_CATEGORIES,
  isExpenseCategory,
  categoryIcon,
  summarizeByCategory,
  CUSTOM_CATEGORY_ICONS,
  isCustomCategoryKey,
} from './category.js';

describe('expense categories (FR-12.2)', () => {
  test('exposes a non-empty set with semantic icon names and keys', () => {
    expect(EXPENSE_CATEGORIES.length).toBeGreaterThan(5);
    for (const c of EXPENSE_CATEGORIES) {
      expect(c.key).toMatch(/^[a-z]+$/);
      // Semantic icon name (lucide kebab-case), never an emoji.
      expect(c.iconName).toMatch(/^[a-z][a-z-]*$/);
    }
  });

  test('includes an "other" fallback category', () => {
    expect(EXPENSE_CATEGORIES.some((c) => c.key === 'other')).toBe(true);
  });

  test('isExpenseCategory validates membership', () => {
    expect(isExpenseCategory('groceries')).toBe(true);
    expect(isExpenseCategory('nonsense')).toBe(false);
  });

  test('categoryIcon returns the icon name, defaulting to "other"', () => {
    expect(categoryIcon('groceries')).toBe(
      EXPENSE_CATEGORIES.find((c) => c.key === 'groceries')!.iconName,
    );
    expect(categoryIcon('unknown')).toBe(
      EXPENSE_CATEGORIES.find((c) => c.key === 'other')!.iconName,
    );
    expect(categoryIcon(null)).toBe(EXPENSE_CATEGORIES.find((c) => c.key === 'other')!.iconName);
  });
});

describe('summarizeByCategory', () => {
  test('aggregates expense spend per category in base minor units', () => {
    const summary = summarizeByCategory([
      { type: 'expense', category: 'groceries', baseMinorUnits: 12000 },
      { type: 'expense', category: 'groceries', baseMinorUnits: 3000 },
      { type: 'expense', category: 'restaurant', baseMinorUnits: 45000 },
      { type: 'transfer', category: null, baseMinorUnits: 99999 }, // ignored
    ]);
    expect(summary).toEqual([
      { category: 'restaurant', totalMinorUnits: 45000, count: 1 },
      { category: 'groceries', totalMinorUnits: 15000, count: 2 },
    ]);
  });

  test('buckets missing categories under "other"', () => {
    const summary = summarizeByCategory([
      { type: 'expense', category: null, baseMinorUnits: 500 },
      { type: 'expense', baseMinorUnits: 1500 },
    ]);
    expect(summary).toEqual([{ category: 'other', totalMinorUnits: 2000, count: 2 }]);
  });

  test('ignores transfers and treats income as reducing the bucket', () => {
    const summary = summarizeByCategory([
      { type: 'expense', category: 'shopping', baseMinorUnits: 10000 },
      { type: 'income', category: 'shopping', baseMinorUnits: -4000 },
      { type: 'transfer', category: 'shopping', baseMinorUnits: 12345 },
    ]);
    expect(summary).toEqual([{ category: 'shopping', totalMinorUnits: 6000, count: 2 }]);
  });

  test('returns an empty array for no transactions', () => {
    expect(summarizeByCategory([])).toEqual([]);
  });

  test('sorts ties by category key for determinism', () => {
    const summary = summarizeByCategory([
      { type: 'expense', category: 'transport', baseMinorUnits: 1000 },
      { type: 'expense', category: 'health', baseMinorUnits: 1000 },
    ]);
    expect(summary.map((s) => s.category)).toEqual(['health', 'transport']);
  });
});

describe('custom categories', () => {
  test('isCustomCategoryKey matches only custom:<id>', () => {
    expect(isCustomCategoryKey('custom:abc123')).toBe(true);
    expect(isCustomCategoryKey('groceries')).toBe(false);
    expect(isCustomCategoryKey('custom:')).toBe(false);
    expect(isCustomCategoryKey('custom:ABC')).toBe(false);
  });

  test('CUSTOM_CATEGORY_ICONS contains the built-in icons and no duplicates', () => {
    for (const c of EXPENSE_CATEGORIES) expect(CUSTOM_CATEGORY_ICONS).toContain(c.iconName);
    expect(new Set(CUSTOM_CATEGORY_ICONS).size).toBe(CUSTOM_CATEGORY_ICONS.length);
  });

  test('summarizeByCategory keeps customKeys as own buckets, folds dangling ones', () => {
    const txns = [
      { type: 'expense', category: 'custom:live1', baseMinorUnits: 100 },
      { type: 'expense', category: 'custom:gone9', baseMinorUnits: 50 },
      { type: 'expense', category: 'groceries', baseMinorUnits: 25 },
    ] as const;
    const withOpts = summarizeByCategory(txns, { customKeys: new Set(['custom:live1']) });
    expect(withOpts.find((s) => s.category === 'custom:live1')?.totalMinorUnits).toBe(100);
    expect(withOpts.find((s) => s.category === 'other')?.totalMinorUnits).toBe(50);
    expect(withOpts.find((s) => s.category === 'groceries')?.totalMinorUnits).toBe(25);
    // Without opts: byte-for-byte legacy behavior — everything custom folds to other.
    const legacy = summarizeByCategory(txns);
    expect(legacy.find((s) => s.category === 'other')?.totalMinorUnits).toBe(150);
    expect(legacy.find((s) => s.category === 'groceries')?.totalMinorUnits).toBe(25);
    expect(legacy.some((s) => s.category.startsWith('custom:'))).toBe(false);
  });
});
