'use client';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Sheet } from '@/components/sheet';
import { AmountText } from '@/components/amount-text';
import { ChevronDown } from '@/components/icons';

type Filter = 'all' | 'paid' | 'share';

/**
 * Read-only ledger explaining one member's balance. Opens from a Zůstatky row.
 *
 * Read like a statement: the answer first (which way, how much — the figure in
 * ink, the direction in the coloured key beside a word), then the two numbers
 * it comes from (paid in, share of the costs), then every line behind them.
 * The filter is the same sunken segmented control as the expense sheet's
 * split, and each ledger line is a full-width 56px row; an itemised share
 * opens in place to show what it was made of.
 */
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
  const bal = data?.balanceMinorUnits ?? 0;
  const direction =
    bal > 0
      ? t('balance.breakdown.isOwed')
      : bal < 0
        ? t('balance.breakdown.owes')
        : t('balance.breakdown.even');

  return (
    <Sheet open={open} onClose={onClose} title={memberName} testId="member-breakdown">
      {!data ? (
        // Holds the head's height while the ledger loads.
        <div className="app-mb-head" aria-busy>
          <span className="app-gd-skel app-gd-skel-label" />
          <span className="app-gd-skel app-gd-skel-figure" />
          <span className="sr-only">{t('common.loading')}</span>
        </div>
      ) : (
        <div className="app-mb">
          <div className="app-mb-head">
            <p className="app-gd-pos-label">
              {bal !== 0 ? (
                <span
                  className={`app-key ${bal > 0 ? 'app-key-pos' : 'app-key-neg'}`}
                  aria-hidden
                />
              ) : null}
              {direction}
            </p>
            <p className="app-mb-figure">
              <AmountText
                minorUnits={Math.abs(bal)}
                currency={baseCurrency}
                display
                testId="breakdown-balance"
              />
            </p>
            <dl className="app-mb-sum">
              <div>
                <dt>{t('balance.breakdown.paid')}</dt>
                <dd>
                  <AmountText minorUnits={data.paidMinorUnits} currency={baseCurrency} />
                </dd>
              </div>
              <div>
                <dt>{t('balance.breakdown.spent')}</dt>
                <dd>
                  <AmountText minorUnits={data.spentMinorUnits} currency={baseCurrency} />
                </dd>
              </div>
            </dl>
          </div>

          <div
            className="grid grid-cols-3 gap-0.5 rounded-xl bg-[var(--app-sunken)] p-0.5 dark:bg-zinc-800"
            role="group"
            aria-label={t('balance.breakdown.filterLabel')}
          >
            {filters.map((f) => {
              const on = filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  aria-pressed={on}
                  data-testid={`breakdown-filter-${f.key}`}
                  className={`min-h-11 min-w-0 truncate rounded-[10px] px-1 text-[0.875rem] tracking-[-0.01em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--app-accent)] ${
                    on
                      ? 'bg-white font-semibold text-[var(--app-ink)] shadow-[0_1px_2px_rgb(17_17_19/0.14),0_0_0_0.5px_rgb(17_17_19/0.08)] dark:bg-zinc-600 dark:text-white dark:shadow-none'
                      : 'font-medium text-[var(--app-ink-2)] active:bg-[var(--app-line)]'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {entries.length === 0 ? (
            <p className="py-8 text-center text-[0.9375rem] text-[var(--app-ink-3)]">
              {t('balance.breakdown.empty')}
            </p>
          ) : (
            <ul className="app-mb-list" data-testid="breakdown-list">
              {entries.map((e) => {
                const key = `${e.txId}-${e.kind}`;
                const canExpand = e.kind === 'share' && e.items != null;
                const isOpen = expanded.has(key);
                const toggle = () =>
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  });
                const inner = (
                  <>
                    <span className="app-mb-text">
                      <span className="app-mb-title">{e.transferLabel ?? e.title}</span>
                      <span className="app-mb-meta">
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
                      className="app-mb-amt"
                    />
                    {canExpand ? (
                      <ChevronDown
                        size={16}
                        aria-hidden
                        className={`app-mb-chev${isOpen ? ' app-mb-chev-open' : ''}`}
                      />
                    ) : null}
                  </>
                );
                return (
                  <li key={key} data-testid="breakdown-row">
                    {canExpand ? (
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={toggle}
                        className="app-mb-row app-mb-row-btn"
                      >
                        {inner}
                      </button>
                    ) : (
                      <div className="app-mb-row">{inner}</div>
                    )}
                    {canExpand && isOpen && e.items ? (
                      <ul className="app-mb-items" data-testid="breakdown-items">
                        {e.items.map((it, i) => (
                          <li key={i}>
                            <span className="min-w-0 truncate">
                              {it.quantity !== 1 ? `${it.quantity}× ` : ''}
                              {it.name}
                            </span>
                            <AmountText
                              minorUnits={it.portionMinorUnits}
                              currency={e.currency ?? baseCurrency}
                            />
                          </li>
                        ))}
                        {e.remainderMinorUnits ? (
                          <li>
                            <span className="min-w-0 truncate">
                              {t('balance.breakdown.shared')}
                            </span>
                            <AmountText
                              minorUnits={e.remainderMinorUnits}
                              currency={e.currency ?? baseCurrency}
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
