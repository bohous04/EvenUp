'use client';
import { categoryIcon } from '@evenup/core';
import type { MessageKey } from '@evenup/i18n';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Card } from '@/components/ui';
import { CategoryIcon } from '@/components/icons';

/** Simple spend-by-category breakdown for a group (FR-12.2). */
export function SpendStats({ groupId, baseCurrency }: { groupId: string; baseCurrency: string }) {
  const { t, formatCurrency } = useI18n();
  const stats = trpc.stats.byCategory.useQuery({ groupId });

  if (!stats.data || stats.data.length === 0) return null;

  const max = Math.max(...stats.data.map((s) => Math.abs(s.totalMinorUnits)), 1);

  return (
    <Card>
      <h3 className="mb-3 font-semibold">{t('stats.spendByCategory')}</h3>
      <ul className="space-y-2" data-testid="spend-stats">
        {stats.data.map((s) => (
          <li key={s.category} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <CategoryIcon name={categoryIcon(s.category)} />
                {t(`category.${s.category}` as MessageKey)}
              </span>
              <span className="font-medium">{formatCurrency(s.totalMinorUnits, baseCurrency)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-brand-500"
                style={{ width: `${Math.max(2, (Math.abs(s.totalMinorUnits) / max) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
