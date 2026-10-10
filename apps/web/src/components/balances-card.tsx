'use client';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Panel, Section, rowClass } from '@/components/ui';
import { AmountText } from '@/components/amount-text';
import { MemberChip } from '@/components/member-chip';
import { MemberBreakdownSheet } from '@/components/member-breakdown-sheet';

/** Per-member balances as bars diverging from a center line (accent = is owed, amber = owes). */
export function BalancesCard({ groupId, baseCurrency }: { groupId: string; baseCurrency: string }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const balances = trpc.balance.get.useQuery({ groupId });

  if (balances.isLoading)
    return <p className="text-zinc-500 dark:text-zinc-400">{t('common.loading')}</p>;
  if (!balances.data) return null;

  const max = Math.max(...balances.data.balances.map((b) => Math.abs(b.balanceMinorUnits)), 1);

  return (
    <Section title={t('balance.title')} className="app-gd-bal">
      <Panel as="ul" plain>
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
                className={rowClass}
              >
                <MemberChip
                  initials={b.initials}
                  color={b.color}
                  name={b.displayName}
                  imageUrl={b.image}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span
                      className="truncate text-[0.9375rem] font-medium tracking-[-0.01em]"
                      title={b.displayName}
                    >
                      {label}
                    </span>
                    {/* Amount never shrinks below its content, so large balances
                      (e.g. "1 761,05 Kč") render in full instead of clipping. */}
                    <AmountText
                      minorUnits={b.balanceMinorUnits}
                      currency={baseCurrency}
                      colored
                      className="shrink-0 text-right text-[0.9375rem] font-medium"
                      testId={`balance-${b.memberId}`}
                    />
                  </span>
                  {/* Diverging bar under the name: right of centre is owed
                      (accent), left is owes (debt amber). */}
                  <span
                    className="relative mt-2 block h-1 rounded-full bg-zinc-100 dark:bg-zinc-800"
                    aria-hidden
                  >
                    <span className="absolute -inset-y-0.5 left-1/2 w-px bg-zinc-300 dark:bg-zinc-700" />
                    {b.balanceMinorUnits !== 0 ? (
                      <span
                        className={`absolute inset-y-0 ${
                          positive
                            ? 'left-1/2 rounded-r-full bg-[var(--app-pos-bar)]'
                            : 'right-1/2 rounded-l-full bg-[var(--app-neg-bar)]'
                        }`}
                        style={{ width: `${Math.max(pct, 1.5)}%` }}
                      />
                    ) : null}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </Panel>
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
    </Section>
  );
}
