'use client';
import { useEffect, useState } from 'react';
import { decimalStringToMinor, EXPENSE_CATEGORIES, RECURRENCE_INTERVALS } from '@evenup/core';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import type { MessageKey } from '@evenup/i18n';
import { Button, Card, Input, Label, Select } from '@/components/ui';
import { MemberChip } from '@/components/member-chip';
import { Modal } from '@/components/modal';
import { CategoryIcon, Plus, ChevronDown } from '@/components/icons';

interface MemberLite {
  id: string;
  displayName: string;
  initials: string;
  color: string;
}

type SplitType = 'EQUAL' | 'EXACT' | 'SHARES' | 'PERCENTAGE';

const SPLIT_LABELS: Record<SplitType, MessageKey> = {
  EQUAL: 'split.equal',
  EXACT: 'split.exact',
  SHARES: 'split.shares',
  PERCENTAGE: 'split.percentage',
};

type RecurrenceValue = 'none' | (typeof RECURRENCE_INTERVALS)[number];
const RECURRENCE_VALUES: RecurrenceValue[] = ['none', ...RECURRENCE_INTERVALS];

/** A radio-style segmented control (one selected value from a small set). */
function Segmented({
  ariaLabel,
  value,
  options,
  onChange,
  testIdPrefix,
}: {
  ariaLabel: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  testIdPrefix: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex flex-wrap gap-1 rounded-lg border border-zinc-200 p-1 dark:border-zinc-700"
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            data-testid={`${testIdPrefix}-${o.value}`}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
              selected
                ? 'bg-brand-600 text-white'
                : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function AddExpenseForm({
  groupId,
  members,
  baseCurrency,
}: {
  groupId: string;
  members: MemberLite[];
  baseCurrency: string;
}) {
  const { t } = useI18n();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(baseCurrency);
  const [fxRate, setFxRate] = useState('');
  const [category, setCategory] = useState('other');
  const [recurrence, setRecurrence] = useState<RecurrenceValue>('none');
  const [splitType, setSplitType] = useState<SplitType>('EQUAL');
  const [payerIdRaw, setPayerId] = useState('');
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  // Per-member values for shares / exact amounts / percentages, keyed by member id.
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const payerId = members.some((m) => m.id === payerIdRaw) ? payerIdRaw : (members[0]?.id ?? '');
  const isSelected = (id: string) => !deselected.has(id);
  const selectedMembers = members.filter((m) => isSelected(m.id));

  const setRecurrenceMutation = trpc.transaction.setRecurrence.useMutation();
  const createExpense = trpc.transaction.createExpense.useMutation({
    onSuccess: (created) => {
      if (recurrence !== 'none') {
        setRecurrenceMutation.mutate({ transactionId: created.id, interval: recurrence });
      }
      // Reset the whole form so the next expense starts from clean defaults —
      // otherwise a persisted currency/split would silently carry over (and keep
      // the FX query running while the modal is closed).
      setTitle('');
      setAmount('');
      setValues({});
      setFxRate('');
      setRecurrence('none');
      setCurrency(baseCurrency);
      setCategory('other');
      setSplitType('EQUAL');
      setPayerId('');
      setDeselected(new Set());
      setShowAdvanced(false);
      setError(null);
      setOpen(false);
      void utils.transaction.list.invalidate({ groupId });
      void utils.balance.get.invalidate({ groupId });
      void utils.stats.byCategory.invalidate({ groupId });
      void utils.activity.list.invalidate({ groupId });
    },
    onError: (e) => setError(e.message),
  });

  const fxResolve = trpc.fx.resolve.useQuery(
    { base: baseCurrency, quote: currency },
    { enabled: currency !== baseCurrency },
  );
  useEffect(() => {
    // Prefill (do not clobber a value the user is editing).
    if (currency !== baseCurrency && fxResolve.data && fxRate === '') {
      setFxRate(fxResolve.data.rateDecimal);
    }
  }, [currency, baseCurrency, fxResolve.data, fxRate]);

  // The advanced panel holds the only inputs for a non-EQUAL split (per-member
  // amounts) and for a foreign currency (the FX rate). Force it open whenever one
  // of those is active so those required inputs can never be collapsed out of
  // reach; the toggle is disabled in that state.
  const requiresAdvanced = splitType !== 'EQUAL' || currency !== baseCurrency;
  const advancedOpen = showAdvanced || requiresAdvanced;

  function toggle(id: string) {
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!payerId || selectedMembers.length === 0) {
      setError(t('split.sumMismatch'));
      return;
    }

    // Common fields incl. multi-currency (FR-8.x): a non-base currency carries
    // an exchange rate to base; the API converts the stored base amount.
    const common = {
      groupId,
      title,
      currency,
      category,
      date: new Date(),
      exchangeRateToBase: currency !== baseCurrency && fxRate ? fxRate : undefined,
    };

    try {
      if (splitType === 'EXACT') {
        // The total is the sum of the per-member exact amounts.
        const exact = selectedMembers.map((m) => ({
          memberId: m.id,
          exactMinorUnits: decimalStringToMinor(values[m.id] ?? '0', currency),
        }));
        const total = exact.reduce((a, x) => a + x.exactMinorUnits, 0);
        if (total <= 0) throw new Error('zero');
        createExpense.mutate({
          ...common,
          payers: [{ memberId: payerId, amountMinorUnits: total }],
          split: { type: 'EXACT', members: exact },
        });
        return;
      }

      const total = decimalStringToMinor(amount, currency);
      if (total <= 0) throw new Error('zero');
      const payers = [{ memberId: payerId, amountMinorUnits: total }];

      if (splitType === 'EQUAL') {
        createExpense.mutate({
          ...common,
          payers,
          split: { type: 'EQUAL', members: selectedMembers.map((m) => ({ memberId: m.id })) },
        });
      } else if (splitType === 'SHARES') {
        createExpense.mutate({
          ...common,
          payers,
          split: {
            type: 'SHARES',
            members: selectedMembers.map((m) => ({
              memberId: m.id,
              weight: Math.max(0, Math.round(Number(values[m.id] ?? '1') || 1)),
            })),
          },
        });
      } else {
        createExpense.mutate({
          ...common,
          payers,
          split: {
            type: 'PERCENTAGE',
            members: selectedMembers.map((m) => ({
              memberId: m.id,
              percentage: Number(values[m.id] ?? '0') || 0,
            })),
          },
        });
      }
    } catch {
      setError(t('split.sumMismatch'));
    }
  }

  const perMemberLabel =
    splitType === 'SHARES'
      ? t('member.defaultShare')
      : splitType === 'PERCENTAGE'
        ? '%'
        : t('expense.amount');

  return (
    <>
      <Card>
        <Button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full"
          data-testid="add-expense-open"
        >
          <Plus size={18} aria-hidden />
          {t('expense.add')}
        </Button>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('expense.add')}
        testId="add-expense-modal"
      >
        <form className="space-y-4" onSubmit={submit}>
          {/* Essentials */}
          <div>
            <Label htmlFor="e-title">{t('expense.title')}</Label>
            <Input
              id="e-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              data-testid="expense-title-input"
            />
          </div>

          <div>
            <Label htmlFor="e-amount">{t('expense.amount')}</Label>
            <Input
              id="e-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`0 ${currency}`}
              disabled={splitType === 'EXACT'}
              required={splitType !== 'EXACT'}
              data-testid="expense-amount-input"
            />
          </div>

          <div>
            <Label>{t('expense.paidBy')}</Label>
            <div
              className="flex flex-wrap gap-2"
              role="radiogroup"
              aria-label={t('expense.paidBy')}
            >
              {members.map((m) => {
                const selected = payerId === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setPayerId(m.id)}
                    data-testid={`payer-chip-${m.id}`}
                    className={`inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
                      selected
                        ? 'border-brand-600 bg-brand-50 font-medium text-brand-800 dark:bg-brand-600/20 dark:text-brand-100'
                        : 'border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <MemberChip
                      initials={m.initials}
                      color={m.color}
                      name={m.displayName}
                      size="sm"
                    />
                    {m.displayName}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label>{t('expense.splitBetween')}</Label>
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label={t('expense.splitBetween')}
            >
              {members.map((m) => (
                <MemberChip
                  key={m.id}
                  initials={m.initials}
                  color={m.color}
                  name={m.displayName}
                  selected={isSelected(m.id)}
                  onClick={() => toggle(m.id)}
                />
              ))}
            </div>
          </div>

          {/* Progressive disclosure */}
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            aria-expanded={advancedOpen}
            disabled={requiresAdvanced}
            data-testid="expense-more-options"
            className="flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:cursor-not-allowed disabled:opacity-60 dark:text-brand-100"
          >
            <ChevronDown
              size={16}
              aria-hidden
              className={`transition-transform ${advancedOpen ? 'rotate-180' : ''}`}
            />
            {advancedOpen ? t('expense.fewerOptions') : t('expense.moreOptions')}
          </button>

          {advancedOpen ? (
            <div className="space-y-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="e-currency">{t('expense.currency')}</Label>
                  <Select
                    id="e-currency"
                    value={currency}
                    onChange={(e) => {
                      setCurrency(e.target.value);
                      setFxRate('');
                    }}
                    data-testid="expense-currency-select"
                  >
                    {[baseCurrency, 'CZK', 'EUR', 'USD', 'GBP', 'PLN']
                      .filter((c, i, arr) => arr.indexOf(c) === i)
                      .map((c) => (
                        <option key={c} value={c}>
                          {c}
                          {c === baseCurrency ? ` (${t('group.baseCurrency')})` : ''}
                        </option>
                      ))}
                  </Select>
                </div>
                {currency !== baseCurrency ? (
                  <div>
                    <Label htmlFor="e-fx">{`${t('fx.rate')} → ${baseCurrency}`}</Label>
                    <Input
                      id="e-fx"
                      inputMode="decimal"
                      value={fxRate}
                      onChange={(e) => setFxRate(e.target.value)}
                      placeholder="24.5"
                      required
                      data-testid="expense-fx-input"
                    />
                    {fxResolve.data ? (
                      <p className="mt-1 text-xs text-zinc-500" data-testid="fx-source">
                        {fxResolve.data.stale
                          ? t('fx.stale')
                          : fxResolve.data.source === 'frankfurter'
                            ? `${t('fx.rate')} · Frankfurter`
                            : t('fx.override')}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div>
                <Label>{t('expense.category')}</Label>
                <div
                  className="grid grid-cols-5 gap-2"
                  role="radiogroup"
                  aria-label={t('expense.category')}
                >
                  {EXPENSE_CATEGORIES.map((c) => {
                    const label = t(`category.${c.key}` as never);
                    const selected = category === c.key;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setCategory(c.key)}
                        title={label}
                        data-testid={`category-chip-${c.key}`}
                        className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
                          selected
                            ? 'border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-600/20 dark:text-brand-100'
                            : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
                        }`}
                      >
                        <CategoryIcon name={c.iconName} size={20} />
                        <span className="text-[10px] leading-tight">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label>{t('expense.splitBetween')}</Label>
                <Segmented
                  ariaLabel={t('expense.splitBetween')}
                  value={splitType}
                  onChange={(v) => setSplitType(v as SplitType)}
                  testIdPrefix="split-type"
                  options={(Object.keys(SPLIT_LABELS) as SplitType[]).map((st) => ({
                    value: st,
                    label: t(SPLIT_LABELS[st]),
                  }))}
                />
              </div>

              {splitType !== 'EQUAL' ? (
                <div className="space-y-2" data-testid="per-member-inputs">
                  {selectedMembers.map((m) => (
                    <div key={m.id} className="flex items-center gap-2">
                      <MemberChip
                        initials={m.initials}
                        color={m.color}
                        name={m.displayName}
                        size="sm"
                      />
                      <span className="flex-1 text-sm">{m.displayName}</span>
                      <div className="w-28">
                        <Input
                          inputMode="decimal"
                          aria-label={`${m.displayName} ${perMemberLabel}`}
                          placeholder={perMemberLabel}
                          value={values[m.id] ?? ''}
                          onChange={(e) => setValues((v) => ({ ...v, [m.id]: e.target.value }))}
                          data-testid={`member-value-${m.id}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div>
                <Label>{t('expense.recurring')}</Label>
                <Segmented
                  ariaLabel={t('expense.recurring')}
                  value={recurrence}
                  onChange={(v) => setRecurrence(v as RecurrenceValue)}
                  testIdPrefix="recurrence"
                  options={RECURRENCE_VALUES.map((r) => ({
                    value: r,
                    label: r === 'none' ? t('recurrence.none') : t(`recurrence.${r}` as never),
                  }))}
                />
              </div>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {error}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={createExpense.isPending}
              data-testid="add-expense-submit"
            >
              {createExpense.isPending ? t('common.loading') : t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
