'use client';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Card, SectionLabel } from '@/components/ui';
import { AmountText } from '@/components/amount-text';
import { MemberChip } from '@/components/member-chip';
import { MemberBreakdownSheet } from '@/components/member-breakdown-sheet';

/** Per-member balances as bars diverging from a center line (green = is owed). */
export function BalancesCard({ groupId, baseCurrency }: { groupId: string; baseCurrency: string }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
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
            <li key={b.memberId}>
              <button
                type="button"
                onClick={() => setSelected({ id: b.memberId, name: b.displayName })}
                data-testid="balance-row"
                aria-label={b.displayName}
                className="flex w-full items-center gap-2 rounded-xl px-1 py-1 text-left transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 dark:hover:bg-zinc-800"
              >
              <span className="flex w-28 min-w-0 shrink-0 items-center gap-1.5">
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
                className="relative h-2 min-w-0 flex-1 rounded-full bg-zinc-100 dark:bg-zinc-800"
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
              {/* Amount never shrinks below its content, so large 4-digit balances
                  (e.g. "1 761,05 Kč") render in full instead of clipping the
                  thousands digit; the min width keeps the bars' right edge aligned. */}
              <AmountText
                minorUnits={b.balanceMinorUnits}
                currency={baseCurrency}
                colored
                className="min-w-[7rem] shrink-0 text-right text-sm font-semibold"
                testId={`balance-${b.memberId}`}
              />
              </button>
            </li>
          );
        })}
      </ul>
      {selected ? (
        <MemberBreakdownSheet
          groupId={groupId}
          memberId={selected.id}
          memberName={selected.name}
          baseCurrency={baseCurrency}
          open={!!selected}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </Card>
  );
}
