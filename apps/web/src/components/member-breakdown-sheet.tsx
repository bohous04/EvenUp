'use client';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Sheet } from '@/components/sheet';
import { AmountText } from '@/components/amount-text';
import { ChevronDown, ChevronRight } from '@/components/icons';

type Filter = 'all' | 'paid' | 'share';

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-zinc-50 px-2 py-2 dark:bg-zinc-800/50">
      <div className="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        {label}
      </div>
      {children}
    </div>
  );
}

/** Read-only ledger explaining one member's balance. Opens from a Zůstatky row. */
export function MemberBreakdownSheet({
  groupId,
  memberId,
  memberName,
  baseCurrency,
  open,
  onClose,
}: {
  groupId: string;
  memberId: string;
  memberName: string;
  baseCurrency: string;
  open: boolean;
  onClose: () => void;
}) {
  const { t, formatDate } = useI18n();
  const breakdown = trpc.balance.memberBreakdown.useQuery({ groupId, memberId }, { enabled: open });
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const data = breakdown.data;
  const entries = (data?.entries ?? []).filter((e) =>
    filter === 'all' ? true : e.kind === filter,
  );
  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: t('balance.breakdown.filterAll') },
    { key: 'paid', label: t('balance.breakdown.filterPaid') },
    { key: 'share', label: t('balance.breakdown.filterShare') },
  ];

  return (
    <Sheet open={open} onClose={onClose} title={memberName} testId="member-breakdown">
      {!data ? (
        <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          {t('common.loading')}
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label={t('balance.breakdown.spent')}>
              <AmountText
                minorUnits={data.spentMinorUnits}
                currency={baseCurrency}
                className="text-sm font-semibold"
              />
            </Stat>
            <Stat label={t('balance.breakdown.paid')}>
              <AmountText
                minorUnits={data.paidMinorUnits}
                currency={baseCurrency}
                className="text-sm font-semibold"
              />
            </Stat>
            <Stat label={t('balance.breakdown.balance')}>
              <AmountText
                minorUnits={data.balanceMinorUnits}
                currency={baseCurrency}
                colored
                className="text-sm font-semibold"
                testId="breakdown-balance"
              />
            </Stat>
          </div>

          <div className="flex gap-1.5" role="group">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                data-testid={`breakdown-filter-${f.key}`}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filter === f.key
                    ? 'bg-brand-600 text-white'
                    : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {entries.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
              {t('balance.breakdown.empty')}
            </p>
          ) : (
            <ul
              className="divide-y divide-zinc-100 dark:divide-zinc-800"
              data-testid="breakdown-list"
            >
              {entries.map((e) => {
                const key = `${e.txId}-${e.kind}`;
                const canExpand = e.kind === 'share' && e.items != null;
                const isOpen = expanded.has(key);
                return (
                  <li key={key} className="py-2" data-testid="breakdown-row">
                    <button
                      type="button"
                      disabled={!canExpand}
                      aria-expanded={canExpand ? isOpen : undefined}
                      onClick={() =>
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        })
                      }
                      className="flex w-full items-center gap-2 text-left disabled:cursor-default"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1 text-sm font-medium">
                          {canExpand ? (
                            isOpen ? (
                              <ChevronDown size={14} aria-hidden />
                            ) : (
                              <ChevronRight size={14} aria-hidden />
                            )
                          ) : null}
                          <span className="truncate">{e.transferLabel ?? e.title}</span>
                        </span>
                        <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                          {e.type === 'TRANSFER'
                            ? t('balance.breakdown.settlement')
                            : e.kind === 'paid'
                              ? t('balance.breakdown.paidRow')
                              : t('balance.breakdown.shareRow')}{' '}
                          · {formatDate(e.date)}
                        </span>
                      </span>
                      <AmountText
                        minorUnits={e.amountMinorUnits}
                        currency={baseCurrency}
                        colored
                        className="text-sm font-semibold"
                      />
                    </button>
                    {canExpand && isOpen && e.items ? (
                      <ul className="ml-5 mt-1 space-y-0.5" data-testid="breakdown-items">
                        {e.items.map((it, i) => (
                          <li
                            key={i}
                            className="flex justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400"
                          >
                            <span className="truncate">
                              {it.quantity !== 1 ? `${it.quantity}× ` : ''}
                              {it.name}
                            </span>
                            <AmountText
                              minorUnits={it.portionMinorUnits}
                              currency={e.currency ?? baseCurrency}
                              className="text-xs"
                            />
                          </li>
                        ))}
                        {e.remainderMinorUnits ? (
                          <li className="flex justify-between gap-2 text-xs text-zinc-400 dark:text-zinc-500">
                            <span className="truncate">{t('balance.breakdown.shared')}</span>
                            <AmountText
                              minorUnits={e.remainderMinorUnits}
                              currency={e.currency ?? baseCurrency}
                              className="text-xs"
                            />
                          </li>
                        ) : null}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Sheet>
  );
}
