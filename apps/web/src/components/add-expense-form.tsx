'use client';
import { useState } from 'react';
import { decimalStringToMinor, EXPENSE_CATEGORIES, RECURRENCE_INTERVALS } from '@evenup/core';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import type { MessageKey } from '@evenup/i18n';
import { Button, Card, Input, Label, Select } from '@/components/ui';
import { MemberChip } from '@/components/member-chip';

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
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(baseCurrency);
  const [fxRate, setFxRate] = useState('');
  const [category, setCategory] = useState('other');
  const [recurrence, setRecurrence] = useState<'none' | (typeof RECURRENCE_INTERVALS)[number]>(
    'none',
  );
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
      setTitle('');
      setAmount('');
      setValues({});
      setFxRate('');
      setRecurrence('none');
      setError(null);
      void utils.transaction.list.invalidate({ groupId });
      void utils.balance.get.invalidate({ groupId });
      void utils.stats.byCategory.invalidate({ groupId });
    },
    onError: (e) => setError(e.message),
  });

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
    <Card>
      <h3 className="mb-3 font-semibold">{t('expense.add')}</h3>
      <form className="space-y-3" onSubmit={submit}>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Label htmlFor="e-title">{t('expense.title')}</Label>
            <Input
              id="e-title"
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
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="e-currency">{t('expense.currency')}</Label>
            <Select
              id="e-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
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
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <Label htmlFor="e-payer">{t('expense.paidBy')}</Label>
            <Select
              id="e-payer"
              value={payerId}
              onChange={(e) => setPayerId(e.target.value)}
              data-testid="expense-payer-select"
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="e-category">{t('expense.category')}</Label>
            <Select
              id="e-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              data-testid="expense-category-select"
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {t(`category.${c.key}` as never)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="e-split-type">{t('expense.splitBetween')}</Label>
            <Select
              id="e-split-type"
              value={splitType}
              onChange={(e) => setSplitType(e.target.value as SplitType)}
              data-testid="expense-split-type"
            >
              {(Object.keys(SPLIT_LABELS) as SplitType[]).map((st) => (
                <option key={st} value={st}>
                  {t(SPLIT_LABELS[st])}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="e-recurrence">{t('expense.recurring')}</Label>
            <Select
              id="e-recurrence"
              value={recurrence}
              onChange={(e) =>
                setRecurrence(e.target.value as 'none' | (typeof RECURRENCE_INTERVALS)[number])
              }
              data-testid="expense-recurrence-select"
            >
              <option value="none">{t('recurrence.none')}</option>
              {RECURRENCE_INTERVALS.map((r) => (
                <option key={r} value={r}>
                  {t(`recurrence.${r}` as never)}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <Label>{t('expense.splitBetween')}</Label>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('expense.splitBetween')}>
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

        {splitType !== 'EQUAL' ? (
          <div className="space-y-2" data-testid="per-member-inputs">
            {selectedMembers.map((m) => (
              <div key={m.id} className="flex items-center gap-2">
                <MemberChip initials={m.initials} color={m.color} name={m.displayName} size="sm" />
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

        {error ? (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={createExpense.isPending} data-testid="add-expense-submit">
          {createExpense.isPending ? t('common.loading') : t('common.save')}
        </Button>
      </form>
    </Card>
  );
}
