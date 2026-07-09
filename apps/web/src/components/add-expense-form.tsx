'use client';
import { useEffect, useState } from 'react';
import {
  allocateEvenly,
  decimalStringToMinor,
  minorToDecimalString,
  splitEqually,
  EXPENSE_CATEGORIES,
  RECURRENCE_INTERVALS,
} from '@evenup/core';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import type { MessageKey } from '@evenup/i18n';
import { Button, Input, Label, SectionLabel } from '@/components/ui';
import { AmountText } from '@/components/amount-text';
import { MemberChip } from '@/components/member-chip';
import { Sheet } from '@/components/sheet';
import { Fab } from '@/components/fab';
import { OcrScan } from '@/components/ocr-scan';
import { CategoryIcon, Camera, ChevronDown } from '@/components/icons';

interface MemberLite {
  id: string;
  displayName: string;
  initials: string;
  color: string;
}

interface CustomCategoryLite {
  id: string;
  name: string;
  iconName: string;
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

/** Local calendar date as YYYY-MM-DD (toISOString would give the UTC date). */
function todayLocalIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Parse YYYY-MM-DD as LOCAL noon — stays on the picked day in every timezone.
 * Falls back to "now" for a malformed/empty input rather than feeding
 * `Number`'s NaN-tolerant parsing bogus year/month/day parts downstream.
 */
function parseLocalDate(iso: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return new Date();
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0);
}

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
      className="flex flex-wrap justify-center gap-1 rounded-lg border border-zinc-200 p-1 dark:border-zinc-700"
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

type Row = 'split' | 'category' | 'date' | 'repeat' | null;

/** Collapsible settings row inside the expense sheet (Split / Category / Date / Repeat). */
function DisclosureRow({
  label,
  value,
  open,
  disabled,
  onToggle,
  testId,
  children,
}: {
  label: string;
  value: React.ReactNode;
  open: boolean;
  disabled?: boolean;
  onToggle: () => void;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-zinc-100 dark:border-zinc-800">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        disabled={disabled}
        data-testid={testId}
        className="flex w-full items-center justify-between py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="text-zinc-600 dark:text-zinc-300">{label}</span>
        <span className="flex items-center gap-1 font-semibold text-brand-600 dark:text-brand-100">
          {value}
          <ChevronDown
            size={16}
            aria-hidden
            className={`transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </span>
      </button>
      {open ? <div className="pb-3">{children}</div> : null}
    </div>
  );
}

export function AddExpenseForm({
  groupId,
  members,
  baseCurrency,
  customCategories,
}: {
  groupId: string;
  members: MemberLite[];
  baseCurrency: string;
  customCategories: CustomCategoryLite[];
}) {
  const { t, formatDate } = useI18n();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
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
  const [openRow, setOpenRow] = useState<Row>(null);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [date, setDate] = useState(() => todayLocalIso());

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
      setOpenRow(null);
      setDate(todayLocalIso());
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

  function toggle(id: string) {
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /**
   * EXACT split with live auto-balancing: the top amount is the target total,
   * members whose field the user has typed into are "locked", and every other
   * member evenly shares the remaining amount (cent-accurate). Editing one
   * member therefore rebalances only the untouched ones. Returns each selected
   * member's amount in minor units.
   */
  function exactMinorByMember(): Map<string, number> {
    const toMinor = (s: string) => {
      try {
        return decimalStringToMinor(s, currency);
      } catch {
        return 0;
      }
    };
    const isLocked = (id: string) => (values[id] ?? '').trim() !== '';
    const result = new Map<string, number>();
    const total = toMinor(amount || '0');
    let lockedSum = 0;
    for (const m of selectedMembers) {
      if (!isLocked(m.id)) continue;
      const v = toMinor((values[m.id] ?? '').trim());
      result.set(m.id, v);
      lockedSum += v;
    }
    // Untouched members evenly share whatever is left of the target total.
    const free = selectedMembers.filter((m) => !isLocked(m.id));
    if (free.length > 0) {
      const shares = allocateEvenly(Math.max(0, total - lockedSum), free.length);
      free.forEach((m, i) => result.set(m.id, shares[i] ?? 0));
    }
    return result;
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
      date: parseLocalDate(date),
      exchangeRateToBase: currency !== baseCurrency && fxRate ? fxRate : undefined,
    };

    try {
      if (splitType === 'EXACT') {
        // Locked members keep their typed value; untouched ones share the
        // remainder of the top total (see exactMinorByMember).
        const amounts = exactMinorByMember();
        const exact = selectedMembers.map((m) => ({
          memberId: m.id,
          exactMinorUnits: amounts.get(m.id) ?? 0,
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

  const splitOpen = openRow === 'split';

  // Live equal-split preview per selected member (cent-accurate via core).
  let shares: Record<string, number> = {};
  if (splitType === 'EQUAL' && selectedMembers.length > 0) {
    try {
      const total = decimalStringToMinor(amount || '0', currency);
      if (total > 0) {
        shares = Object.fromEntries(
          splitEqually(
            total,
            selectedMembers.map((m) => ({ memberId: m.id })),
          ).map((s) => [s.memberId, s.computedMinorUnits]),
        );
      }
    } catch {
      // ignore preview errors while the user is typing
    }
  }

  // Auto-balanced amounts for the EXACT split; drives both the per-member field
  // display and what gets submitted.
  const exactAmounts = splitType === 'EXACT' ? exactMinorByMember() : null;
  // What to show in a member's amount field: the raw text they typed (locked),
  // otherwise the live auto-balanced share (blank while there's nothing to share).
  const memberFieldValue = (id: string): string => {
    if (splitType !== 'EXACT') return values[id] ?? '';
    const typed = values[id];
    if (typed != null && typed.trim() !== '') return typed;
    const minor = exactAmounts?.get(id) ?? 0;
    return minor > 0 ? minorToDecimalString(minor, currency) : '';
  };

  const toggleRow = (row: Exclude<Row, null>) => setOpenRow((r) => (r === row ? null : row));

  // Resolve the selected category's label + icon. A `custom:<id>` value shows the
  // custom category's own name/icon; if that custom was deleted meanwhile we fall
  // back to the built-in "other" label/icon.
  const selectedCustom = category.startsWith('custom:')
    ? customCategories.find((c) => `custom:${c.id}` === category)
    : undefined;
  const categoryLabel = category.startsWith('custom:')
    ? (selectedCustom?.name ?? t('category.other'))
    : t(`category.${category}` as MessageKey);
  const categoryIconName = selectedCustom
    ? selectedCustom.iconName
    : (EXPENSE_CATEGORIES.find((c) => c.key === category)?.iconName ?? 'package');

  return (
    <>
      <Fab
        onClick={() => setOpen(true)}
        aria-label={t('expense.add')}
        data-testid="add-expense-open"
      />

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('expense.add')}
        testId="add-expense-modal"
        footer={
          <>
            {error ? (
              <p role="alert" className="mb-2 text-sm text-red-700 dark:text-red-400">
                {error}
              </p>
            ) : null}
            <Button
              type="submit"
              form="add-expense-form"
              disabled={createExpense.isPending}
              className="w-full"
              data-testid="add-expense-submit"
            >
              {createExpense.isPending ? t('common.loading') : t('common.save')}
            </Button>
          </>
        }
      >
        <form id="add-expense-form" className="space-y-4" onSubmit={submit}>
          {/* Amount first — the amount is centered (sits above the title), the
              currency is pinned to the far right. */}
          <div className="relative flex items-end justify-center">
            <input
              id="e-amount"
              inputMode="decimal"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              required
              aria-label={t('expense.amount')}
              data-testid="expense-amount-input"
              className="w-40 bg-transparent text-center text-4xl font-extrabold tabular-nums text-zinc-900 outline-none placeholder:text-zinc-300 dark:text-zinc-100 dark:placeholder:text-zinc-600"
            />
            <select
              value={currency}
              onChange={(e) => {
                setCurrency(e.target.value);
                setFxRate('');
              }}
              aria-label={t('expense.currency')}
              data-testid="expense-currency-select"
              className="absolute bottom-1.5 right-0 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm font-medium outline-none focus:border-brand-500 dark:border-zinc-700 dark:bg-zinc-800"
            >
              {[baseCurrency, 'CZK', 'EUR', 'USD', 'GBP', 'PLN']
                .filter((c, i, arr) => arr.indexOf(c) === i)
                .map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
            </select>
          </div>

          {/* FX rate, only for a foreign currency (kept next to the amount) */}
          {currency !== baseCurrency ? (
            <div className="mx-auto max-w-xs">
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
                <p
                  className="mt-1 text-xs text-zinc-500 dark:text-zinc-400"
                  data-testid="fx-source"
                >
                  {fxResolve.data.stale
                    ? t('fx.stale')
                    : fxResolve.data.source === 'frankfurter'
                      ? `${t('fx.rate')} · Frankfurter`
                      : t('fx.override')}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Title */}
          <input
            id="e-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder={t('expense.title')}
            aria-label={t('expense.title')}
            data-testid="expense-title-input"
            className="w-full border-b border-zinc-100 bg-transparent pb-2 text-center text-sm outline-none placeholder:text-zinc-400 focus:border-brand-500 dark:border-zinc-800"
          />

          {/* Paid by — chips exactly as today (radiogroup, payer-chip-<id> testids) */}
          <div>
            <SectionLabel>{t('expense.paidBy')}</SectionLabel>
            <div
              className="flex flex-wrap justify-center gap-2"
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
                        ? 'border-brand-600 bg-brand-50 font-medium text-brand-700 dark:bg-brand-600/20 dark:text-brand-100'
                        : 'border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800'
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

          {/* For whom — toggle chips with a live equal-share preview */}
          <div>
            <SectionLabel>{t('expense.splitBetween')}</SectionLabel>
            <div
              className="flex flex-wrap justify-center gap-2"
              role="group"
              aria-label={t('expense.splitBetween')}
            >
              {members.map((m) => {
                const selected = isSelected(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggle(m.id)}
                    className={`inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
                      selected
                        ? 'border-brand-600 bg-brand-50 font-medium text-brand-700 dark:bg-brand-600/20 dark:text-brand-100'
                        : 'border-zinc-200 opacity-60 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <MemberChip
                      initials={m.initials}
                      color={m.color}
                      name={m.displayName}
                      size="sm"
                    />
                    {m.displayName}
                    {selected && shares[m.id] != null ? (
                      <AmountText
                        minorUnits={shares[m.id]!}
                        currency={currency}
                        className="text-xs text-zinc-500 dark:text-zinc-400"
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Collapsed settings rows */}
          <div className="border-t border-zinc-100 dark:border-zinc-800">
            <DisclosureRow
              label={t('expense.splitBetween')}
              value={t(SPLIT_LABELS[splitType])}
              open={splitOpen}
              onToggle={() => toggleRow('split')}
              testId="expense-split-row"
            >
              <div className="space-y-3">
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
                            value={memberFieldValue(m.id)}
                            onChange={(e) => setValues((v) => ({ ...v, [m.id]: e.target.value }))}
                            data-testid={`member-value-${m.id}`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </DisclosureRow>

            <DisclosureRow
              label={t('expense.category')}
              value={
                <span className="flex items-center gap-1.5">
                  <CategoryIcon name={categoryIconName} />
                  {categoryLabel}
                </span>
              }
              open={openRow === 'category'}
              onToggle={() => toggleRow('category')}
              testId="expense-category-row"
            >
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
                      className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
                        selected
                          ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-600/20 dark:text-brand-100'
                          : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <CategoryIcon name={c.iconName} size={20} />
                      <span className="text-[10px] leading-tight">{label}</span>
                    </button>
                  );
                })}
                {customCategories.map((c) => {
                  const key = `custom:${c.id}`;
                  const selected = category === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setCategory(key)}
                      title={c.name}
                      data-testid={`category-chip-${key}`}
                      className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
                        selected
                          ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-600/20 dark:text-brand-100'
                          : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <CategoryIcon name={c.iconName} size={20} />
                      <span className="text-[10px] leading-tight">{c.name}</span>
                    </button>
                  );
                })}
              </div>
            </DisclosureRow>

            <DisclosureRow
              label={t('expense.date')}
              value={formatDate(parseLocalDate(date))}
              open={openRow === 'date'}
              onToggle={() => toggleRow('date')}
              testId="expense-date-row"
            >
              <Input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label={t('expense.date')}
                data-testid="expense-date-input"
              />
            </DisclosureRow>

            <DisclosureRow
              label={t('expense.recurring')}
              value={
                recurrence === 'none'
                  ? t('recurrence.none')
                  : t(`recurrence.${recurrence}` as never)
              }
              open={openRow === 'repeat'}
              onToggle={() => toggleRow('repeat')}
              testId="expense-repeat-row"
            >
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
            </DisclosureRow>

            {/* Receipt scan — opens the OCR flow in its own sheet */}
            <button
              type="button"
              onClick={() => setOcrOpen(true)}
              data-testid="expense-receipt-row"
              className="flex w-full items-center justify-between py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              <span className="text-zinc-600 dark:text-zinc-300">{t('ocr.scan')}</span>
              <Camera size={16} aria-hidden className="text-brand-600 dark:text-brand-100" />
            </button>
          </div>

        </form>
      </Sheet>

      {/* OCR flow in its own sheet, stacked above the expense sheet */}
      <Sheet open={ocrOpen} onClose={() => setOcrOpen(false)} title={t('ocr.scan')}>
        <OcrScan
          groupId={groupId}
          members={members}
          baseCurrency={baseCurrency}
          onSaved={() => {
            setOcrOpen(false);
            setOpen(false);
          }}
        />
      </Sheet>
    </>
  );
}
