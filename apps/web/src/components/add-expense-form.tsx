'use client';
import { useEffect, useId, useState } from 'react';
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
import { useExpenseQueue } from '@/lib/offline/use-expense-queue';
import { clampAmountDecimals } from '@/lib/amount-input';
import { parseLocalDate, todayLocalIso, localIso } from '@/lib/local-date';
import type { MessageKey } from '@evenup/i18n';
import { Button, Input } from '@/components/ui';
import { AmountText } from '@/components/amount-text';
import { MemberChip } from '@/components/member-chip';
import { Sheet } from '@/components/sheet';
import { Fab } from '@/components/fab';
import { OcrScan } from '@/components/ocr-scan';
import {
  CategoryIcon,
  Camera,
  ChevronDown,
  Check,
  CalendarDays,
  Repeat,
  Trash2,
  Users,
} from '@/components/icons';
import { ItemizedEditor, itemPriceToMinor, type EditorItem } from '@/components/itemized-editor';
import { COMMON_CURRENCIES } from '@/lib/currencies';

interface MemberLite {
  id: string;
  displayName: string;
  initials: string;
  color: string;
  imageUrl?: string | null;
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

/** One-word labels for the segmented control: all five fit one line at 390px. */
const SPLIT_SHORT: Record<SplitType, MessageKey> = {
  EQUAL: 'split.equalShort',
  EXACT: 'split.exactShort',
  SHARES: 'split.sharesShort',
  PERCENTAGE: 'split.percentageShort',
  ITEMIZED: 'split.itemizedShort',
};

type RecurrenceValue = 'none' | (typeof RECURRENCE_INTERVALS)[number];
const RECURRENCE_VALUES: RecurrenceValue[] = ['none', ...RECURRENCE_INTERVALS];

/** A transaction as returned by `transaction.list` — the shape we edit in place. */
type EditableTransaction = RouterOutputs['transaction']['list'][number];

/**
 * Fields in this sheet take focus the way the amount and title lines do: the
 * edge turns ink. No tinted wash — the sheet is monochrome; the accent is kept
 * for keyboard focus rings.
 */
const inkFocus = 'focus:!border-[var(--app-ink)] focus:!ring-1 focus:!ring-[var(--app-ink)]';

/** Horizontal strip that scrolls edge to edge on phones (no wrapping). */
const stripClass =
  '-mx-4 flex gap-2 overflow-x-auto overscroll-x-contain px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden';

/**
 * A radio-style choice (one value from a small set). Default: one line of
 * 44px keys that scrolls sideways on a phone. `fill`: a segmented track whose
 * keys share the full width equally, so every option is on screen at 390px
 * with nothing clipped at the edge. The chosen key is ink, like the primary
 * action.
 */
function Segmented({
  ariaLabel,
  value,
  options,
  onChange,
  testIdPrefix,
  fill = false,
}: {
  ariaLabel: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  testIdPrefix: string;
  fill?: boolean;
}) {
  if (fill) {
    // One sunken track, the chosen method a raised key in it — a single
    // control read at a glance, not a row of tabs. Five equal 44px keys fit
    // 358px with room around each label; nothing is clipped at 390px.
    return (
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        className="grid auto-cols-fr grid-flow-col gap-0.5 rounded-xl bg-[var(--app-sunken)] p-0.5 dark:bg-zinc-800"
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
              className={`min-h-11 min-w-0 truncate rounded-[10px] px-0.5 text-[0.8125rem] tracking-[-0.01em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--app-accent)] ${
                selected
                  ? 'bg-white font-semibold text-[var(--app-ink)] shadow-[0_1px_2px_rgb(17_17_19/0.14),0_0_0_0.5px_rgb(17_17_19/0.08)] dark:bg-zinc-600 dark:text-white dark:shadow-none'
                  : 'font-medium text-[var(--app-ink-2)] active:bg-[var(--app-line)]'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={stripClass}>
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
            className={`min-h-11 shrink-0 whitespace-nowrap rounded-xl border px-3.5 text-[0.9375rem] font-medium tracking-[-0.01em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-1 ${
              selected
                ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-950'
                : 'border-[var(--app-line-2)] bg-[var(--app-raised)] text-[var(--app-ink-2)] active:bg-[var(--app-sunken)]'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

type Row = 'category' | 'date' | 'repeat' | null;

/**
 * One 56px row of the details list (Category / Date / Repeat): icon, label,
 * the current value and a chevron; tapping it opens its picker in place.
 */
function DisclosureRow({
  label,
  icon,
  value,
  open,
  disabled,
  onToggle,
  testId,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  value: React.ReactNode;
  open: boolean;
  disabled?: boolean;
  onToggle: () => void;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-[var(--app-line)] last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        disabled={disabled}
        data-testid={testId}
        className="app-row -mx-2 flex min-h-14 w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 text-left text-[0.9375rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--app-ink-3)]"
          aria-hidden
        >
          {icon}
        </span>
        <span className="flex-1 font-medium text-[var(--app-ink)]">{label}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-[var(--app-ink-2)]">
          <span className="truncate">{value}</span>
          <ChevronDown
            size={16}
            aria-hidden
            className={`shrink-0 text-[var(--app-ink-3)] transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </span>
      </button>
      {open ? <div className="pb-4 pt-1">{children}</div> : null}
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
  readOnly = false,
  autoOpen = false,
}: {
  groupId: string;
  members: MemberLite[];
  baseCurrency: string;
  customCategories: CustomCategoryLite[];
  /** When set, the sheet edits this transaction in place instead of adding one. */
  editing?: EditableTransaction | null;
  /** Called to close the sheet in edit mode (the parent controls visibility). */
  onClose?: () => void;
  /**
   * The viewer is a GUEST: hide the button that opens this sheet.
   *
   * Purely a courtesy — `assertGroupWrite` already refuses the mutation server
   * side, and that is the check that actually protects anything. Hiding the FAB
   * just stops offering an action that is guaranteed to fail.
   */
  readOnly?: boolean;
  /**
   * Open the add sheet once on mount — the groups home's "Add expense" lands
   * here with `?add=1`, so one tap there is one tap to the amount field.
   */
  autoOpen?: boolean;
}) {
  const { t, formatDate, formatCurrency } = useI18n();
  const utils = trpc.useUtils();
  const isEdit = editing != null;
  const formId = useId();
  const [open, setOpen] = useState(false);
  // In edit mode the parent mounts us only while editing, so the sheet is open;
  // in add mode we own the open state (toggled by the FAB).
  const sheetOpen = isEdit ? true : open;
  useEffect(() => {
    if (!autoOpen || isEdit) return;
    if (!readOnly) setOpen(true);
    // Drop `?add=1` so a reload or Back does not open the sheet again.
    const url = new URL(window.location.href);
    url.searchParams.delete('add');
    window.history.replaceState(window.history.state, '', url);
    // Mount-only: a later prop change must not reopen a sheet the user closed.
  }, []);
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
  const [amountFocused, setAmountFocused] = useState(false);
  // An equal split is one summary line until the user asks to change who is in.
  const [splitOpen, setSplitOpen] = useState(false);

  const payerId = members.some((m) => m.id === payerIdRaw) ? payerIdRaw : (members[0]?.id ?? '');
  const isSelected = (id: string) => !deselected.has(id);
  const selectedMembers = members.filter((m) => isSelected(m.id));
  const allSelected = members.length > 0 && selectedMembers.length === members.length;

  const setRecurrenceMutation = trpc.transaction.setRecurrence.useMutation();
  const invalidateGroup = () => {
    void utils.transaction.list.invalidate({ groupId });
    void utils.balance.get.invalidate({ groupId });
    void utils.balance.nextPayer.invalidate({ groupId });
    void utils.stats.byCategory.invalidate({ groupId });
    void utils.activity.list.invalidate({ groupId });
  };

  /**
   * Reset every field back to the add-expense defaults (does not touch the
   * open/close state). Runs both after a successful save AND when the FAB
   * re-opens the sheet, so a draft abandoned by closing without saving never
   * carries its old title/amount into the next expense.
   */
  const resetForm = () => {
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
    setSplitOpen(false);
    setDate(todayLocalIso());
    setError(null);
  };

  /*
   * Offline entry: a new expense is written to IndexedDB and then drained, so
   * an expense that never reaches the network is still on disk. The immediate
   * success case is identical to the online one — a user should not be able to
   * tell which path their expense took.
   */
  const createQueued = trpc.transaction.createExpense.useMutation();
  const recurQueued = trpc.transaction.setRecurrence.useMutation();
  const sendQueued = useExpenseQueue({
    send: async (item) => {
      const { _recurrence, ...payload } = item.payload as Record<string, unknown> & {
        _recurrence?: string;
      };
      // The queue stores an untyped record; it was written by this component
      // from its own typed input, so casting back is restoring information,
      // not discarding a check.
      const created = await createQueued.mutateAsync({
        ...(payload as Parameters<typeof createQueued.mutateAsync>[0]),
        clientMutationId: item.id,
      });
      // Recurrence can only be set once the server has handed back a
      // transaction id — exactly the moment a queued expense stops existing
      // offline. Carrying it in the payload keeps the user's intent rather
      // than dropping it when they saved without signal.
      if (_recurrence) {
        await recurQueued.mutateAsync({
          transactionId: created.id,
          interval: _recurrence as never,
        });
      }
    },
    onSynced: () => {
      invalidateGroup();
    },
  });

  const createExpense = trpc.transaction.createExpense.useMutation({
    onSuccess: (created) => {
      if (recurrence !== 'none') {
        setRecurrenceMutation.mutate({ transactionId: created.id, interval: recurrence });
      }
      // Reset the whole form so the next expense starts from clean defaults —
      // otherwise a persisted currency/split would silently carry over (and keep
      // the FX query running while the modal is closed).
      resetForm();
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
      if (isEdit && editing) {
        // Editing an existing transaction is not queued: the server has the
        // original, so there is nothing to lose by failing loudly.
        updateExpense.mutate({ transactionId: editing.id, ...payload });
        return;
      }
      // A new expense always goes through the queue, online or not.
      void sendQueued
        .enqueue(groupId, {
          ...payload,
          ...(recurrence !== 'none' ? { _recurrence: recurrence } : {}),
        })
        .then((landed: boolean) => {
          resetForm();
          setOpen(false);
          // Same close-and-reset either way; the badge is the only difference
          // the user sees, and only while the expense is still queued.
          if (landed) invalidateGroup();
        });
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
        setError(t('ocr.itemNeedsPrice'));
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

  // One person's equal share for the collapsed summary (the first takes any
  // leftover cent, so it is the figure nobody pays more than).
  const splitCollapsed = splitType === 'EQUAL' && !splitOpen;
  const firstSelected = selectedMembers[0];
  const perPersonMinor = firstSelected ? (shares[firstSelected.id] ?? null) : null;

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

  // The amount as money ("1 840 Kč" / "CZK 1,840"), shown over the field when
  // it is not being edited; null while editing or when it does not parse.
  let amountParts: { pre: string; num: string; post: string } | null = null;
  if (!amountFocused && displayAmount.trim() !== '') {
    try {
      const minor = decimalStringToMinor(displayAmount, currency);
      const text = formatCurrency(minor, currency, { trimZeroFraction: true }).replace(
        /\s/g,
        '\u00a0',
      );
      const m = /^(\D*?)\u00a0?([\d-][\d\u00a0.,]*\d|\d)\u00a0?(\D*)$/.exec(text);
      if (m) amountParts = { pre: m[1] ?? '', num: m[2] ?? '', post: m[3] ?? '' };
    } catch {
      // mid-typing or unparseable: the field shows exactly what was typed
    }
  }

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

  const unitSuffix = splitType === 'PERCENTAGE' ? '%' : splitType === 'SHARES' ? '×' : currency;

  return (
    <>
      {!isEdit && !readOnly ? (
        <Fab
          onClick={() => {
            // Start every new expense from clean defaults — a draft left behind
            // by closing the sheet without saving must not reappear here.
            resetForm();
            setOpen(true);
          }}
          label={t('expense.add')}
          shortLabel={t('expense.addShort')}
          data-testid="add-expense-open"
        />
      ) : null}

      <Sheet
        open={sheetOpen}
        onClose={closeSheet}
        title={isEdit ? t('expense.edit') : t('expense.add')}
        testId="add-expense-modal"
        footer={
          // The one action, pinned under the thumb: always in view, however
          // long the split list grows (it submits the form by id).
          <Button
            type="submit"
            form={formId}
            disabled={isSaving}
            className="min-h-12 w-full text-base"
            data-testid="add-expense-submit"
          >
            {isSaving ? t('common.loading') : t('common.save')}
          </Button>
        }
      >
        <form id={formId} className="space-y-5" onSubmit={submit}>
          {/* 1 — How much, and for what. The figure leads, left-aligned like
              the screens' own figures, and reads as money once you leave it
              ("1 840 Kč", the unit lighter). Beside it, two 44px keys: the
              currency and the receipt scan (the other way in). The title is
              one quiet line under it, not a boxed field — the sheet is a
              document you fill in, top to bottom. */}
          <div>
            <label htmlFor="e-amount" className="sr-only">
              {t('expense.amount')}
            </label>
            <div className="flex items-center gap-2 border-b border-[var(--app-line-2)] pb-2 focus-within:border-[var(--app-ink)]">
              <span className="relative block min-w-0 flex-1">
                <input
                  id="e-amount"
                  inputMode="decimal"
                  autoFocus={splitType !== 'ITEMIZED'}
                  value={displayAmount}
                  onChange={(e) => {
                    if (splitType !== 'ITEMIZED')
                      setAmount(clampAmountDecimals(e.target.value, currency));
                  }}
                  onFocus={() => setAmountFocused(true)}
                  onBlur={() => setAmountFocused(false)}
                  readOnly={splitType === 'ITEMIZED'}
                  placeholder="0"
                  required
                  autoComplete="off"
                  data-testid="expense-amount-input"
                  className={`block h-14 w-full bg-transparent text-[2.5rem] font-semibold leading-none tracking-[-0.035em] tabular-nums outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-700 ${
                    amountParts ? 'text-transparent' : 'text-[var(--app-ink)]'
                  } ${splitType === 'ITEMIZED' ? 'cursor-default' : ''}`}
                />
                {amountParts ? (
                  // The same figure, formatted, laid over the (transparent)
                  // field while it is not being edited — the field's value
                  // stays exactly what was typed.
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-nowrap text-[2.5rem] font-semibold leading-none tracking-[-0.035em] tabular-nums text-[var(--app-ink)]"
                    data-testid="expense-amount-display"
                  >
                    {amountParts.pre ? (
                      <span className="mr-[0.18em] text-[0.55em] font-medium tracking-[-0.01em] text-[var(--app-ink-3)]">
                        {amountParts.pre}
                      </span>
                    ) : null}
                    {amountParts.num}
                    {amountParts.post ? (
                      <span className="ml-[0.18em] text-[0.55em] font-medium tracking-[-0.01em] text-[var(--app-ink-3)]">
                        {amountParts.post}
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </span>
              <span className="relative shrink-0">
                <select
                  value={currency}
                  onChange={(e) => {
                    setCurrency(e.target.value);
                    setFxRate('');
                  }}
                  aria-label={t('expense.currency')}
                  data-testid="expense-currency-select"
                  className="min-h-11 appearance-none rounded-xl border border-[var(--app-line-2)] bg-[var(--app-raised)] py-2 pl-3 pr-7 text-[0.9375rem] font-semibold text-[var(--app-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
                >
                  {[baseCurrency, ...COMMON_CURRENCIES]
                    .filter((c, i, arr) => arr.indexOf(c) === i)
                    .map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                </select>
                <ChevronDown
                  size={15}
                  aria-hidden
                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--app-ink-3)]"
                />
              </span>
              <button
                type="button"
                onClick={() => setOcrOpen(true)}
                aria-label={t('ocr.scan')}
                title={t('ocr.scan')}
                data-testid="expense-receipt-row"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--app-line-2)] bg-[var(--app-raised)] text-[var(--app-ink)] active:bg-[var(--app-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
              >
                <Camera size={19} aria-hidden />
              </button>
            </div>

            {/* FX rate, only for a foreign currency (kept with the amount). */}
            {currency !== baseCurrency ? (
              <div className="mt-3 flex items-center gap-3">
                <label htmlFor="e-fx" className="flex-1 text-[0.875rem] text-[var(--app-ink-2)]">
                  {`${t('fx.rate')} → ${baseCurrency}`}
                  {fxResolve.data ? (
                    <span
                      className="mt-0.5 block text-[0.8125rem] text-[var(--app-ink-3)]"
                      data-testid="fx-source"
                    >
                      {fxResolve.data.stale
                        ? t('fx.stale')
                        : fxResolve.data.source === 'frankfurter'
                          ? `${t('fx.rate')} · Frankfurter`
                          : t('fx.override')}
                    </span>
                  ) : null}
                </label>
                <Input
                  id="e-fx"
                  inputMode="decimal"
                  value={fxRate}
                  onChange={(e) => setFxRate(e.target.value)}
                  placeholder="24.5"
                  required
                  className={`!w-28 text-right tabular-nums ${inkFocus}`}
                  data-testid="expense-fx-input"
                />
              </div>
            ) : null}

            <label htmlFor="e-title" className="sr-only">
              {t('expense.titleLabel')}
            </label>
            <input
              id="e-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoComplete="off"
              enterKeyHint="done"
              placeholder={t('expense.titleLabel')}
              data-testid="expense-title-input"
              className="block min-h-12 w-full border-b border-[var(--app-line)] bg-transparent text-[1.0625rem] font-medium tracking-[-0.01em] text-[var(--app-ink)] outline-none transition-colors placeholder:font-normal placeholder:text-[var(--app-ink-3)] focus:border-[var(--app-ink)]"
            />
          </div>

          {/* 2 — Who paid: one line. The label names the payer; the faces
              beside it are the choice (44px keys, ring on the chosen one),
              scrolling sideways — with a fade at the edge — only when the
              group is bigger than the row. */}
          <div className="flex min-h-12 items-center gap-3">
            <div className="min-w-0 shrink-0" aria-hidden>
              <span className="block text-[0.8125rem] font-medium text-[var(--app-ink-3)]">
                {t('expense.paidBy')}
              </span>
              <span className="block max-w-[7.5rem] truncate text-[0.9375rem] font-semibold tracking-[-0.01em] text-[var(--app-ink)]">
                {members.find((m) => m.id === payerId)?.displayName ?? '–'}
              </span>
            </div>
            <div
              className={`-mr-4 flex min-w-0 flex-1 overflow-x-auto overscroll-x-contain pr-4 [scrollbar-width:none] sm:mr-0 sm:pr-0 [&::-webkit-scrollbar]:hidden ${
                members.length > 5 ? 'app-payer-fade' : ''
              }`}
              role="radiogroup"
              aria-label={t('expense.paidBy')}
            >
              <div className="ml-auto flex shrink-0 gap-1">
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
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ring-inset transition-shadow focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--app-accent)] ${
                        selected ? 'ring-2 ring-[var(--app-ink)]' : ''
                      }`}
                    >
                      <MemberChip
                        initials={m.initials}
                        color={m.color}
                        name={m.displayName}
                        imageUrl={m.imageUrl}
                        size="md"
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 3 — The split. The method is one sunken track; under it, an
              equal split is a single line ("Everyone (5) · 368 Kč each") —
              five identical rows would say the same thing five times and push
              the details below the fold. Tapping the line opens the member
              list to change who is in; the other methods need a field per
              member, so they open it straight away. */}
          <div>
            <h3 className="mb-2 text-[0.8125rem] font-medium text-[var(--app-ink-3)]">
              {t('split.type')}
            </h3>
            <Segmented
              fill
              ariaLabel={t('expense.splitMethod')}
              value={splitType}
              onChange={(v) => setSplitType(v as SplitType)}
              testIdPrefix="split-type"
              options={(Object.keys(SPLIT_LABELS) as SplitType[]).map((st) => ({
                value: st,
                label: t(SPLIT_SHORT[st]),
              }))}
            />

            {splitType === 'ITEMIZED' ? (
              <div className="mt-4">
                <ItemizedEditor
                  items={itemRows}
                  onChange={setItemRows}
                  members={members}
                  baseCurrency={currency}
                />
              </div>
            ) : splitCollapsed ? null : (
              <div className="mt-2">
                {/* Who is in ("5/5") and the toggle for all of them. */}
                <div className="flex min-h-11 items-center justify-between gap-3">
                  <h3 className="text-[0.9375rem] font-semibold tracking-[-0.015em] text-[var(--app-ink)]">
                    {t('expense.splitBetween')}{' '}
                    <span className="font-medium tabular-nums text-[var(--app-ink-3)]">
                      {selectedMembers.length}/{members.length}
                    </span>
                  </h3>
                  <button
                    type="button"
                    onClick={() =>
                      setDeselected(allSelected ? new Set(members.map((m) => m.id)) : new Set())
                    }
                    className="-mr-2 min-h-11 rounded-lg px-2 text-[0.875rem] font-medium text-[var(--app-ink)] underline decoration-[var(--app-line-2)] underline-offset-4 active:bg-[var(--app-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                    data-testid="split-select-all"
                  >
                    {allSelected ? t('expense.selectNone') : t('expense.selectAll')}
                  </button>
                </div>
                <div
                  role="group"
                  aria-label={t('expense.splitBetween')}
                  data-testid={splitType !== 'EQUAL' ? 'per-member-inputs' : undefined}
                >
                  {members.map((m) => {
                    const selected = isSelected(m.id);
                    return (
                      <div
                        key={m.id}
                        className="flex min-h-14 items-center gap-2 border-b border-[var(--app-line)] last:border-b-0"
                      >
                        <button
                          type="button"
                          aria-pressed={selected}
                          onClick={() => toggle(m.id)}
                          className="app-row -ml-2 flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-lg pl-2 pr-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600"
                        >
                          <span
                            aria-hidden
                            className={`flex h-[1.375rem] w-[1.375rem] shrink-0 items-center justify-center rounded-md border-[1.5px] transition-colors ${
                              selected
                                ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-950'
                                : 'border-[var(--app-line-2)] bg-[var(--app-raised)]'
                            }`}
                          >
                            {selected ? <Check size={14} strokeWidth={3} /> : null}
                          </span>
                          <MemberChip
                            initials={m.initials}
                            color={m.color}
                            name={m.displayName}
                            imageUrl={m.imageUrl}
                            size="md"
                          />
                          <span
                            className={`truncate text-[0.9375rem] ${
                              selected
                                ? 'font-medium text-[var(--app-ink)]'
                                : 'text-[var(--app-ink-3)]'
                            }`}
                          >
                            {m.displayName}
                          </span>
                        </button>
                        {selected && splitType === 'EQUAL' ? (
                          shares[m.id] != null ? (
                            <AmountText
                              minorUnits={shares[m.id]!}
                              currency={currency}
                              className="shrink-0 text-[0.9375rem] tabular-nums text-[var(--app-ink)]"
                            />
                          ) : (
                            <span className="shrink-0 text-[0.9375rem] text-[var(--app-ink-3)]">
                              –
                            </span>
                          )
                        ) : null}
                        {selected && splitType !== 'EQUAL' ? (
                          <span className="flex shrink-0 items-center gap-1.5">
                            <Input
                              inputMode="decimal"
                              aria-label={`${m.displayName} ${perMemberLabel}`}
                              placeholder={splitType === 'SHARES' ? '1' : '0'}
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
                              className={`!w-24 text-right tabular-nums ${inkFocus}`}
                              data-testid={`member-value-${m.id}`}
                            />
                            <span
                              aria-hidden
                              className="w-8 text-[0.8125rem] text-[var(--app-ink-3)]"
                            >
                              {unitSuffix}
                            </span>
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 4 — Details, collapsed to one line each; an equal split's "for
              whom" line leads the list, so it reads as one list of settings. */}
          <div className="border-t border-[var(--app-line)]">
            {splitCollapsed ? (
              <div className="border-b border-[var(--app-line)]">
                <button
                  type="button"
                  onClick={() => setSplitOpen(true)}
                  aria-expanded={false}
                  data-testid="split-summary"
                  className="app-row -mx-2 flex min-h-14 w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 text-left text-[0.9375rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600"
                >
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--app-ink-3)]"
                    aria-hidden
                  >
                    <Users size={18} />
                  </span>
                  <span className="flex-1 font-medium text-[var(--app-ink)]">
                    {t('expense.forWhom')}
                  </span>
                  <span className="flex min-w-0 flex-col items-end leading-tight">
                    <span className="truncate text-[var(--app-ink)]">
                      {allSelected
                        ? t('expense.splitAll', { count: members.length })
                        : t('expense.splitSome', {
                            count: selectedMembers.length,
                            total: members.length,
                          })}
                    </span>
                    {perPersonMinor != null ? (
                      <span className="mt-0.5 truncate text-[0.8125rem] tabular-nums text-[var(--app-ink-3)]">
                        {t('expense.perPerson', {
                          amount: formatCurrency(perPersonMinor, currency, {
                            trimZeroFraction: true,
                          }),
                        })}
                      </span>
                    ) : null}
                  </span>
                  <ChevronDown size={16} aria-hidden className="shrink-0 text-[var(--app-ink-3)]" />
                </button>
              </div>
            ) : null}
            <DisclosureRow
              label={t('expense.category')}
              icon={<CategoryIcon name={categoryIconName} size={18} />}
              value={categoryLabel}
              open={openRow === 'category'}
              onToggle={() => toggleRow('category')}
              testId="expense-category-row"
            >
              <div
                className="grid grid-cols-3 gap-2 sm:grid-cols-5"
                role="radiogroup"
                aria-label={t('expense.category')}
              >
                {[
                  ...EXPENSE_CATEGORIES.map((c) => ({
                    key: c.key,
                    iconName: c.iconName,
                    label: t(`category.${c.key}` as never) as string,
                  })),
                  ...customCategories.map((c) => ({
                    key: `custom:${c.id}`,
                    iconName: c.iconName,
                    label: c.name,
                  })),
                ].map((c) => {
                  const selected = category === c.key;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setCategory(c.key)}
                      title={c.label}
                      data-testid={`category-chip-${c.key}`}
                      className={`flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl border px-1 py-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
                        selected
                          ? 'border-zinc-900 bg-[var(--app-sunken)] text-[var(--app-ink)] dark:border-zinc-50'
                          : 'border-[var(--app-line)] text-[var(--app-ink-2)] active:bg-[var(--app-sunken)]'
                      }`}
                    >
                      <CategoryIcon name={c.iconName} size={20} />
                      <span className="line-clamp-2 text-[0.75rem] leading-tight">{c.label}</span>
                    </button>
                  );
                })}
              </div>
            </DisclosureRow>

            <DisclosureRow
              label={t('expense.date')}
              icon={<CalendarDays size={18} />}
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
              icon={<Repeat size={18} />}
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
          </div>

          {error ? (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {error}
            </p>
          ) : null}

          {editing ? (
            <Button
              type="button"
              variant="secondary"
              className="w-full !text-red-700 dark:!text-red-400"
              disabled={deleteTransaction.isPending}
              onClick={() => {
                if (window.confirm(t('expense.deleteConfirm')))
                  deleteTransaction.mutate({ transactionId: editing.id });
              }}
              data-testid="edit-expense-delete"
            >
              <Trash2 size={16} aria-hidden />
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
