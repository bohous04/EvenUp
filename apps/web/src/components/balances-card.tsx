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

  if (balances.isLoading)
    return <p className="text-zinc-500 dark:text-zinc-400">{t('common.loading')}</p>;
  if (!balances.data) return null;

  const max = Math.max(...balances.data.balances.map((b) => Math.abs(b.balanceMinorUnits)), 1);

  return (
    <Card>
      <SectionLabel>{t('balance.title')}</SectionLabel>
      <ul className="space-y-2.5">
        {balances.data.balances.map((b) => {
          const positive = b.balanceMinorUnits > 0;
          const pct = (Math.abs(b.balanceMinorUnits) / max) * 50;
          // Show up to 20 chars of the name; full name stays in the tooltip.
          const label =
            b.displayName.length > 20 ? `${b.displayName.slice(0, 20)}…` : b.displayName;
          return (
            <li key={b.memberId} className="flex items-center gap-2">
              <span className="flex w-44 min-w-0 items-center gap-1.5">
                <MemberChip
                  initials={b.initials}
                  color={b.color}
                  name={b.displayName}
                  imageUrl={b.image}
                  size="sm"
                />
                <span className="truncate text-sm" title={b.displayName}>
                  {label}
                </span>
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
