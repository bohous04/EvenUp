'use client';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Button, Card, SectionLabel } from '@/components/ui';
import { AmountText } from '@/components/amount-text';
import { MemberChip } from '@/components/member-chip';
import { QrCode } from '@/components/qr-code';
import { Sheet } from '@/components/sheet';
import { ArrowRight, ChevronRight } from '@/components/icons';

interface MemberLite {
  id: string;
  displayName: string;
  initials: string;
  color: string;
}

/** The group's lead card: minimal settlement payments, each row opening a settle sheet. */
export function SettleCard({
  groupId,
  members,
  baseCurrency,
}: {
  groupId: string;
  members: MemberLite[];
  baseCurrency: string;
}) {
  const { t } = useI18n();
  const balances = trpc.balance.get.useQuery({ groupId });
  const byId = new Map(members.map((m) => [m.id, m]));

  if (!balances.data) return null;
  const payments = balances.data.payments;

  return (
    <Card>
      <SectionLabel>{t('balance.suggestedPayments')}</SectionLabel>
      {payments.length === 0 ? (
        <p className="py-2 text-center text-sm text-zinc-500 dark:text-zinc-400" data-testid="settled-up">
          {t('balance.settledUp')}
        </p>
      ) : (
        <ul className="-mx-2" data-testid="payments-list">
          {payments.map((p, i) => (
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
  const { t } = useI18n();
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
      void utils.activity.list.invalidate({ groupId });
    },
  });

  if (!from || !to) return null;

  const record = (method: 'CASH' | 'QR') =>
    recordTransfer.mutate({
      groupId,
      fromMemberId: from.id,
      toMemberId: to.id,
      amountMinorUnits: amount,
      currency: baseCurrency,
      method,
    });

  return (
    <li>
      {/* The whole row is the tap target (approved in mockups) — no separate button. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="settle-btn"
        className="flex w-full items-center gap-2 rounded-xl px-2 py-2.5 text-left text-sm font-semibold transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 dark:hover:bg-zinc-800"
      >
        <MemberChip initials={from.initials} color={from.color} name={from.displayName} size="sm" />
        <span className="min-w-0 truncate">{from.displayName}</span>
        <ArrowRight size={14} aria-hidden className="shrink-0 text-zinc-300 dark:text-zinc-600" />
        <MemberChip initials={to.initials} color={to.color} name={to.displayName} size="sm" />
        <span className="min-w-0 truncate">{to.displayName}</span>
        <AmountText
          minorUnits={amount}
          currency={baseCurrency}
          className="ml-auto font-bold text-brand-600 dark:text-brand-100"
        />
        <ChevronRight size={16} aria-hidden className="shrink-0 text-zinc-300 dark:text-zinc-600" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={t('settle.title')} testId="settle-sheet">
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <MemberChip initials={from.initials} color={from.color} name={from.displayName} size="sm" />
            {from.displayName}
            <ArrowRight size={14} aria-hidden className="text-zinc-300 dark:text-zinc-600" />
            <MemberChip initials={to.initials} color={to.color} name={to.displayName} size="sm" />
            {to.displayName}
          </div>
          <AmountText
            minorUnits={amount}
            currency={baseCurrency}
            className="text-3xl font-extrabold tracking-tight"
          />
          {spayd.data ? (
            <>
              <QrCode value={spayd.data.spayd} />
              <code className="max-w-full break-all text-center text-[10px] text-zinc-500 dark:text-zinc-400">
                {spayd.data.spayd}
              </code>
            </>
          ) : spayd.isError ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{t('settle.noIban')}</p>
          ) : (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{t('common.loading')}</p>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => record('CASH')} data-testid="mark-cash">
              {t('settle.method.cash')}
            </Button>
            <Button onClick={() => record('QR')} data-testid="mark-paid">
              {t('settle.markPaid')}
            </Button>
          </div>
        </div>
      </Sheet>
    </li>
  );
}
