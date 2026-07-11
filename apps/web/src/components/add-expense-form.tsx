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
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { clampAmountDecimals } from '@/lib/amount-input';
import type { MessageKey } from '@evenup/i18n';
import { Button, Input, Label, SectionLabel } from '@/components/ui';
import { AmountText } from '@/components/amount-text';
import { MemberChip } from '@/components/member-chip';
import { Sheet } from '@/components/sheet';
import { Fab } from '@/components/fab';
import { OcrScan } from '@/components/ocr-scan';
import { CategoryIcon, Camera, ChevronDown } from '@/components/icons';
import { ItemizedEditor, itemPriceToMinor, type EditorItem } from '@/components/itemized-editor';
import { COMMON_CURRENCIES } from '@/lib/currencies';

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

type SplitType = 'EQUAL' | 'EXACT' | 'SHARES' | 'PERCENTAGE' | 'ITEMIZED';

const SPLIT_LABELS: Record<SplitType, MessageKey> = {
  EQUAL: 'split.equal',
  EXACT: 'split.exact',
  SHARES: 'split.shares',
  PERCENTAGE: 'split.percentage',
  ITEMIZED: 'split.itemized',
};

type RecurrenceValue = 'none' | (typeof RECURRENCE_INTERVALS)[number];
const RECURRENCE_VALUES: RecurrenceValue[] = ['none', ...RECURRENCE_INTERVALS];

/** A `Date` as a local YYYY-MM-DD string (toISOString would give the UTC date). */
function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Today as a local YYYY-MM-DD string. */
function todayLocalIso(): string {
  return localIso(new Date());
}

/** A transaction as returned by `transaction.list` — the shape we edit in place. */
type EditableTransaction = RouterOutputs['transaction']['list'][number];

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
  editing = null,
  onClose,
}: {
  groupId: string;
  members: MemberLite[];
  baseCurrency: string;
  customCategories: CustomCategoryLite[];
  /** When set, the sheet edits this transaction in place instead of adding one. */
  editing?: EditableTransaction | null;
  /** Called to close the sheet in edit mode (the parent controls visibility). */
  onClose?: () => void;
}) {
  const { t, formatDate } = useI18n();
  const utils = trpc.useUtils();
  const isEdit = editing != null;
  const [open, setOpen] = useState(false);
  // In edit mode the parent mounts us only while editing, so the sheet is open;
  // in add mode we own the open state (toggled by the FAB).
  const sheetOpen = isEdit ? true : open;
  const closeSheet = () => (isEdit ? onClose?.() : setOpen(false));
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
  // Items for the ITEMIZED split (shared editor state — name/price/assignees).
  const [itemRows, setItemRows] = useState<EditorItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<Row>(null);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [date, setDate] = useState(() => todayLocalIso());

  const payerId = members.some((m) => m.id === payerIdRaw) ? payerIdRaw : (members[0]?.id ?? '');
  const isSelected = (id: string) => !deselected.has(id);
  const selectedMembers = members.filter((m) => isSelected(m.id));

  const setRecurrenceMutation = trpc.transaction.setRecurrence.useMutation();
  const invalidateGroup = () => {
    void utils.transaction.list.invalidate({ groupId });
    void utils.balance.get.invalidate({ groupId });
    void utils.balance.nextPayer.invalidate({ groupId });
    void utils.stats.byCategory.invalidate({ groupId });
    void utils.activity.list.invalidate({ groupId });
  };
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
      setItemRows([]);
      setPayerId('');
      setDeselected(new Set());
      setOpenRow(null);
      setDate(todayLocalIso());
      setError(null);
      setOpen(false);
      invalidateGroup();
    },
    onError: (e) => setError(e.message),
  });

  const updateExpense = trpc.transaction.updateExpense.useMutation({
    onSuccess: () => {
      invalidateGroup();
      onClose?.();
    },
    onError: (e) => setError(e.message),
  });
  const deleteTransaction = trpc.transaction.delete.useMutation({
    onSuccess: () => {
      invalidateGroup();
      onClose?.();
    },
    onError: (e) => setError(e.message),
  });
  const isSaving = createExpense.isPending || updateExpense.isPending;

  // Seed the form from the transaction being edited — only when a *different*
  // transaction is opened, so re-renders never clobber the user's in-progress edits.
  useEffect(() => {
    if (!editing) return;
    // Cleared upfront; the ITEMIZED branch below re-fills it when applicable —
    // otherwise a previously edited itemized expense's rows would linger if the
    // user manually switches this expense's split type to ITEMIZED.
    setItemRows([]);
    setTitle(editing.title);
    setCurrency(editing.currency);
    setAmount(minorToDecimalString(Math.abs(Number(editing.totalMinorUnits)), editing.currency));
    setCategory(editing.category ?? 'other');
    setDate(localIso(new Date(editing.date)));
    setPayerId(editing.payers[0]?.memberId ?? '');
    const splitMembers = new Set(editing.splits.map((s) => s.memberId));
    setDeselected(new Set(members.filter((m) => !splitMembers.has(m.id)).map((m) => m.id)));
    if (editing.splitType === 'ITEMIZED' && editing.items && editing.items.length > 0) {
      setSplitType('ITEMIZED');
      setItemRows(
        editing.items.map((it) => ({
          name: it.name,
          priceText: minorToDecimalString(Math.abs(it.totalMinorUnits), editing.currency),
          assigned: new Set(it.memberIds),
        })),
      );
      setFxRate('');
      setRecurrence('none');
      setOpenRow(null);
      setError(null);
      return; // handled — skip the EXACT fallback
    }
    // Restore the exact split from the raw per-member input we persisted, so a
    // SHARES/PERCENTAGE expense keeps its type and ratios — not just its amounts.
    const st = editing.splitType;
    if (st === 'SHARES') {
      setSplitType('SHARES');
      setValues(
        Object.fromEntries(editing.splits.map((s) => [s.memberId, String(s.shareWeight ?? 1)])),
      );
    } else if (st === 'PERCENTAGE') {
      setSplitType('PERCENTAGE');
      setValues(
        Object.fromEntries(editing.splits.map((s) => [s.memberId, String(s.percentage ?? 0)])),
      );
    } else if (st === 'EQUAL') {
      setSplitType('EQUAL');
      setValues({});
    } else {
      // EXACT — or anything the form can't represent (ITEMIZED) — edits as exact
      // amounts. `exactMinorUnits` is only set on EXACT rows; others fall back to
      // the computed share, so this one branch covers both.
      setSplitType('EXACT');
      setValues(
        Object.fromEntries(
          editing.splits.map((s) => [
            s.memberId,
            minorToDecimalString(
              Math.abs(Number(s.exactMinorUnits ?? s.computedMinorUnits)),
              editing.currency,
            ),
          ]),
        ),
      );
    }
    setFxRate('');
    setRecurrence('none');
    setOpenRow(null);
    setError(null);
    // Depends only on the transaction id: re-seed when a *different* transaction
    // is opened, never on every re-render (which would clobber in-progress edits).
  }, [editing?.id]);

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
    // "Locked" = the user has touched this field at all (a key exists in
    // `values`), even if they cleared it back to empty. An empty locked field
    // contributes 0 and is NOT auto-refilled — see the note in memberFieldValue.
    const isLocked = (id: string) => values[id] !== undefined;
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
    // ITEMIZED assigns members per item (validated in that branch below) rather
    // than via the "for whom" picker, so it only requires a payer — not a
    // non-empty member selection.
    if (!payerId || (splitType !== 'ITEMIZED' && selectedMembers.length === 0)) {
      setError(t('split.sumMismatch'));
      return;
    }

    // Same payload either way; in edit mode it carries the transaction id and
    // updates in place, otherwise it creates a new expense.
    const runMutation = (payload: Parameters<typeof createExpense.mutate>[0]) => {
      if (isEdit && editing) updateExpense.mutate({ transactionId: editing.id, ...payload });
      else createExpense.mutate(payload);
    };

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

    if (splitType === 'ITEMIZED') {
      // Mirrors the validation `ocr-scan.tsx`'s save() uses: at least one item
      // row, each with a valid positive price and at least one assignee.
      if (itemRows.length === 0) {
        setError(t('split.sumMismatch'));
        return;
      }
      const parsed = itemRows.map((it) => ({
        name: it.name.trim() || undefined,
        minor: itemPriceToMinor(it.priceText, currency),
        memberIds: [...it.assigned],
      }));
      if (parsed.some((it) => it.minor == null)) {
        setError(t('split.sumMismatch'));
        return;
      }
      if (parsed.some((it) => it.memberIds.length === 0)) {
        setError(t('ocr.assignItems'));
        return;
      }
      const items = parsed.map((it) => ({
        name: it.name,
        totalMinorUnits: it.minor!,
        memberIds: it.memberIds,
      }));
      const total = items.reduce((a, it) => a + it.totalMinorUnits, 0);
      runMutation({
        ...common,
        title: title.trim() || t('expense.title'),
        payers: [{ memberId: payerId, amountMinorUnits: total }],
        split: { type: 'ITEMIZED', items },
      });
      return;
    }

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
        runMutation({
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
        runMutation({
          ...common,
          payers,
          split: { type: 'EQUAL', members: selectedMembers.map((m) => ({ memberId: m.id })) },
        });
      } else if (splitType === 'SHARES') {
        runMutation({
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
        runMutation({
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
    // Once the user has touched a field we show EXACTLY what they typed — even an
    // empty string — and never snap it back to the auto-balanced share. That's
    // what lets them clear a field and type a fresh number without the value (and
    // caret) jumping back mid-edit. Untouched fields still preview their share.
    const typed = values[id];
    if (typed !== undefined) return typed;
    const minor = exactAmounts?.get(id) ?? 0;
    return minor > 0 ? minorToDecimalString(minor, currency) : '';
  };

  // ITEMIZED's top amount is derived (read-only), not typed — it's the live sum
  // of the item rows, in the same shape `minorToDecimalString` expects.
  const itemizedTotalMinor = itemRows.reduce(
    (s, it) => s + (itemPriceToMinor(it.priceText, currency) ?? 0),
    0,
  );
  const displayAmount =
    splitType === 'ITEMIZED' ? minorToDecimalString(itemizedTotalMinor, currency) : amount;

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
      {!isEdit ? (
        <Fab
          onClick={() => setOpen(true)}
          aria-label={t('expense.add')}
          data-testid="add-expense-open"
        />
      ) : null}

      <Sheet
        open={sheetOpen}
        onClose={closeSheet}
        title={isEdit ? t('expense.edit') : t('expense.add')}
        testId="add-expense-modal"
      >
        <form className="space-y-4" onSubmit={submit}>
          {/* Amount first — the amount is centered (sits above the title), the
              currency is pinned to the far right. */}
          <div className="relative flex items-end justify-center">
            <input
              id="e-amount"
              inputMode="decimal"
              autoFocus={splitType !== 'ITEMIZED'}
              value={displayAmount}
              onChange={(e) => {
                if (splitType !== 'ITEMIZED')
                  setAmount(clampAmountDecimals(e.target.value, currency));
              }}
              readOnly={splitType === 'ITEMIZED'}
              placeholder="0"
              required
              aria-label={t('expense.amount')}
              data-testid="expense-amount-input"
              className={`w-40 bg-transparent text-center text-4xl font-extrabold tabular-nums text-zinc-900 outline-none placeholder:text-zinc-300 dark:text-zinc-100 dark:placeholder:text-zinc-600 ${
                splitType === 'ITEMIZED' ? 'cursor-default' : ''
              }`}
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
              {[baseCurrency, ...COMMON_CURRENCIES]
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

          {/* For whom — toggle chips with a live equal-share preview. ITEMIZED
              assigns members per item instead (see ItemizedEditor below), so the
              blanket member-picker doesn't apply in that mode. */}
          {splitType !== 'ITEMIZED' ? (
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
          ) : null}

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
                {splitType === 'ITEMIZED' ? (
                  <ItemizedEditor
                    items={itemRows}
                    onChange={setItemRows}
                    members={members}
                    baseCurrency={currency}
                  />
                ) : splitType !== 'EQUAL' ? (
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
                            onChange={(e) =>
                              setValues((v) => ({
                                ...v,
                                [m.id]:
                                  splitType === 'EXACT'
                                    ? clampAmountDecimals(e.target.value, currency)
                                    : e.target.value,
                              }))
                            }
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

          {error ? (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {error}
            </p>
          ) : null}

          {/* In-flow (not sticky) so it never floats over the form; the sheet's
              bottom padding scrolls it clear of the mobile browser toolbar. */}
          <Button
            type="submit"
            disabled={isSaving}
            className="w-full"
            data-testid="add-expense-submit"
          >
            {isSaving ? t('common.loading') : t('common.save')}
          </Button>

          {editing ? (
            <Button
              type="button"
              variant="danger"
              className="w-full"
              disabled={deleteTransaction.isPending}
              onClick={() => {
                if (window.confirm(t('expense.deleteConfirm')))
                  deleteTransaction.mutate({ transactionId: editing.id });
              }}
              data-testid="edit-expense-delete"
            >
              {t('expense.delete')}
            </Button>
          ) : null}
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
