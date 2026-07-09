'use client';
import { categoryIcon } from '@evenup/core';
import type { MessageKey } from '@evenup/i18n';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { AmountText } from '@/components/amount-text';
import { CategoryIcon } from '@/components/icons';

interface CustomCategoryLite {
  id: string;
  name: string;
  iconName: string;
}

/** Simple spend-by-category breakdown for a group (FR-12.2). */
export function SpendStats({
  groupId,
  baseCurrency,
  customCategories,
}: {
  groupId: string;
  baseCurrency: string;
  customCategories: CustomCategoryLite[];
}) {
  const { t } = useI18n();
  const stats = trpc.stats.byCategory.useQuery({ groupId });

  if (!stats.data || stats.data.length === 0) {
    return <p className="py-4 text-center text-sm text-zinc-500 dark:text-zinc-400">—</p>;
  }

  const max = Math.max(...stats.data.map((s) => Math.abs(s.totalMinorUnits)), 1);

  return (
    <ul className="space-y-2" data-testid="spend-stats">
      {stats.data.map((s) => {
        // A `custom:<id>` bucket shows the custom category's own name/icon; a
        // dangling custom key (folded server-side, shouldn't surface here) falls
        // back to the built-in "other" label/icon.
        const custom = s.category.startsWith('custom:')
          ? customCategories.find((c) => `custom:${c.id}` === s.category)
          : undefined;
        const label = s.category.startsWith('custom:')
          ? (custom?.name ?? t('category.other'))
          : t(`category.${s.category}` as MessageKey);
        const iconName = custom ? custom.iconName : categoryIcon(s.category);
        return (
        <li key={s.category} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <CategoryIcon name={iconName} />
              {label}
            </span>
            <AmountText
              minorUnits={s.totalMinorUnits}
              currency={baseCurrency}
              className="font-medium"
            />
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-brand-500"
              style={{ width: `${Math.max(2, (Math.abs(s.totalMinorUnits) / max) * 100)}%` }}
            />
          </div>
        </li>
        );
      })}
    </ul>
  );
}
