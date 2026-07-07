'use client';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Button, Card } from '@/components/ui';
import { MemberChip } from '@/components/member-chip';
import { QrCode } from '@/components/qr-code';

interface MemberLite {
  id: string;
  displayName: string;
  initials: string;
  color: string;
}

export function BalancesPanel({
  groupId,
  members,
  baseCurrency,
}: {
  groupId: string;
  members: MemberLite[];
  baseCurrency: string;
}) {
  const { t, formatCurrency } = useI18n();
  const balances = trpc.balance.get.useQuery({ groupId });
  const byId = new Map(members.map((m) => [m.id, m]));

  if (balances.isLoading) return <p className="text-neutral-500">{t('common.loading')}</p>;
  if (!balances.data) return null;

  const settled = balances.data.balances.every((b) => b.balanceMinorUnits === 0);

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-3 font-semibold">{t('balance.title')}</h3>
        <ul className="space-y-2">
          {balances.data.balances.map((b) => {
            const positive = b.balanceMinorUnits > 0;
            const zero = b.balanceMinorUnits === 0;
            return (
              <li key={b.memberId} className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <MemberChip
                    initials={b.initials}
                    color={b.color}
                    name={b.displayName}
                    size="sm"
                  />
                  {b.displayName}
                </span>
                <span
                  className={
                    zero
                      ? 'text-neutral-500 dark:text-neutral-400'
                      : positive
                        ? 'font-semibold text-green-700 dark:text-green-400'
                        : 'font-semibold text-red-700 dark:text-red-400'
                  }
                  data-testid={`balance-${b.memberId}`}
                >
                  {formatCurrency(b.balanceMinorUnits, baseCurrency)}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <h3 className="mb-3 font-semibold">{t('balance.suggestedPayments')}</h3>
        {settled || balances.data.payments.length === 0 ? (
          <p className="text-center text-neutral-500" data-testid="settled-up">
            {t('balance.settledUp')}
          </p>
        ) : (
          <ul className="space-y-3" data-testid="payments-list">
            {balances.data.payments.map((p, i) => (
              <SettleRow
                key={`${p.fromMemberId}-${p.toMemberId}-${i}`}
                groupId={groupId}
                baseCurrency={baseCurrency}
                from={byId.get(p.fromMemberId)}
                to={byId.get(p.toMemberId)}
                amount={p.amountMinorUnits}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function SettleRow({
  groupId,
  baseCurrency,
  from,
  to,
  amount,
}: {
  groupId: string;
  baseCurrency: string;
  from?: MemberLite;
  to?: MemberLite;
  amount: number;
}) {
  const { t, formatCurrency } = useI18n();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);

  const spayd = trpc.settlement.generateSpayd.useQuery(
    { groupId, toMemberId: to?.id ?? '', amountMinorUnits: amount, currency: baseCurrency },
    { enabled: open && !!to, retry: false },
  );
  const recordTransfer = trpc.transaction.recordTransfer.useMutation({
    onSuccess: () => {
      setOpen(false);
      void utils.balance.get.invalidate({ groupId });
      void utils.transaction.list.invalidate({ groupId });
    },
  });

  if (!from || !to) return null;

  return (
    <li className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm">
          <MemberChip
            initials={from.initials}
            color={from.color}
            name={from.displayName}
            size="sm"
          />
          <span aria-hidden>→</span>
          <MemberChip initials={to.initials} color={to.color} name={to.displayName} size="sm" />
          <strong>{formatCurrency(amount, baseCurrency)}</strong>
        </span>
        <Button variant="secondary" onClick={() => setOpen((v) => !v)} data-testid="settle-btn">
          {t('settle.title')}
        </Button>
      </div>

      {open ? (
        <div className="mt-3 flex flex-col items-center gap-3 border-t border-neutral-100 pt-3 dark:border-neutral-800">
          {spayd.data ? (
            <>
              <QrCode value={spayd.data.spayd} />
              <code className="max-w-full break-all text-center text-[10px] text-neutral-500">
                {spayd.data.spayd}
              </code>
            </>
          ) : spayd.isError ? (
            <p className="text-xs text-neutral-500">{t('settle.noIban')}</p>
          ) : (
            <p className="text-xs text-neutral-400">{t('common.loading')}</p>
          )}
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() =>
                recordTransfer.mutate({
                  groupId,
                  fromMemberId: from.id,
                  toMemberId: to.id,
                  amountMinorUnits: amount,
                  currency: baseCurrency,
                  method: 'CASH',
                })
              }
              data-testid="mark-cash"
            >
              {t('settle.method.cash')}
            </Button>
            <Button
              onClick={() =>
                recordTransfer.mutate({
                  groupId,
                  fromMemberId: from.id,
                  toMemberId: to.id,
                  amountMinorUnits: amount,
                  currency: baseCurrency,
                  method: 'QR',
                })
              }
              data-testid="mark-paid"
            >
              {t('settle.markPaid')}
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
