'use client';
import { useState } from 'react';
import { decimalStringToMinor, minorToDecimalString } from '@evenup/core';
import { useI18n } from '@/lib/i18n';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { clampAmountDecimals } from '@/lib/amount-input';
import { Button, Input, Label, Select } from '@/components/ui';
import { Sheet } from '@/components/sheet';

interface MemberLite {
  id: string;
  displayName: string;
  initials: string;
  color: string;
}

type Transfer = RouterOutputs['transaction']['list'][number];

const METHODS = ['CASH', 'QR', 'BANK'] as const;
const METHOD_LABEL: Record<(typeof METHODS)[number], string> = {
  CASH: 'settle.method.cash',
  QR: 'settle.method.qr',
  BANK: 'settle.method.bank',
};

/** Edit an existing settlement/transfer in place (amount, direction, method, date). */
export function EditTransferSheet({
  transaction,
  members,
  onClose,
}: {
  transaction: Transfer;
  members: MemberLite[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const utils = trpc.useUtils();
  const groupId = transaction.groupId;
  const currency = transaction.currency;

  const [fromMemberId, setFromMemberId] = useState(
    transaction.fromMemberId ?? transaction.payers[0]?.memberId ?? '',
  );
  const [toMemberId, setToMemberId] = useState(
    transaction.toMemberId ?? transaction.splits[0]?.memberId ?? '',
  );
  const [amount, setAmount] = useState(
    minorToDecimalString(Math.abs(Number(transaction.totalMinorUnits)), currency),
  );
  const [method, setMethod] = useState<(typeof METHODS)[number]>(
    (transaction.method as (typeof METHODS)[number]) ?? 'CASH',
  );
  const [note, setNote] = useState(transaction.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const invalidateGroup = () => {
    void utils.transaction.list.invalidate({ groupId });
    void utils.balance.get.invalidate({ groupId });
    void utils.balance.nextPayer.invalidate({ groupId });
    void utils.activity.list.invalidate({ groupId });
  };
  const updateTransfer = trpc.transaction.updateTransfer.useMutation({
    onSuccess: () => {
      invalidateGroup();
      onClose();
    },
    onError: (e) => setError(e.message),
  });
  const deleteTransaction = trpc.transaction.delete.useMutation({
    onSuccess: () => {
      invalidateGroup();
      onClose();
    },
    onError: (e) => setError(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (fromMemberId === toMemberId) {
      setError(t('settle.title'));
      return;
    }
    let amountMinorUnits: number;
    try {
      amountMinorUnits = decimalStringToMinor(amount, currency);
    } catch {
      setError(t('expense.amount'));
      return;
    }
    if (amountMinorUnits <= 0) {
      setError(t('expense.amount'));
      return;
    }
    updateTransfer.mutate({
      transactionId: transaction.id,
      groupId,
      fromMemberId,
      toMemberId,
      amountMinorUnits,
      currency,
      method,
      note: note.trim() || undefined,
    });
  }

  return (
    <Sheet open onClose={onClose} title={t('transfer.edit')} testId="edit-transfer-modal">
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="tr-from">{t('expense.paidBy')}</Label>
            <Select
              id="tr-from"
              value={fromMemberId}
              onChange={(e) => setFromMemberId(e.target.value)}
              data-testid="transfer-from"
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="tr-to">{t('settle.markPaid')}</Label>
            <Select
              id="tr-to"
              value={toMemberId}
              onChange={(e) => setToMemberId(e.target.value)}
              data-testid="transfer-to"
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="tr-amount">{`${t('expense.amount')} (${currency})`}</Label>
          <Input
            id="tr-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(clampAmountDecimals(e.target.value, currency))}
            required
            data-testid="transfer-amount"
          />
        </div>

        <div>
          <Label>{t('settle.title')}</Label>
          <div className="flex flex-wrap gap-1 rounded-lg border border-zinc-200 p-1 dark:border-zinc-700">
            {METHODS.map((mth) => {
              const selected = mth === method;
              return (
                <button
                  key={mth}
                  type="button"
                  onClick={() => setMethod(mth)}
                  aria-pressed={selected}
                  data-testid={`transfer-method-${mth}`}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
                    selected
                      ? 'bg-brand-600 text-white'
                      : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
                  }`}
                >
                  {t(METHOD_LABEL[mth] as never)}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <Label htmlFor="tr-note">{t('expense.note')}</Label>
          <Input
            id="tr-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            data-testid="transfer-note"
          />
        </div>

        {error ? (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          className="w-full"
          disabled={updateTransfer.isPending}
          data-testid="edit-transfer-submit"
        >
          {updateTransfer.isPending ? t('common.loading') : t('common.save')}
        </Button>
        <Button
          type="button"
          variant="danger"
          className="w-full"
          disabled={deleteTransaction.isPending}
          onClick={() => {
            if (window.confirm(t('expense.deleteConfirm')))
              deleteTransaction.mutate({ transactionId: transaction.id });
          }}
          data-testid="edit-transfer-delete"
        >
          {t('transfer.delete')}
        </Button>
      </form>
    </Sheet>
  );
}
