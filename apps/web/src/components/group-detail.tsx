'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Button, Card } from '@/components/ui';
import { MemberList } from '@/components/member-list';
import { AddMemberForm } from '@/components/add-member-form';
import { AddExpenseForm } from '@/components/add-expense-form';
import { BalancesPanel } from '@/components/balances-panel';
import { BankDetailsForm } from '@/components/bank-details-form';
import { OcrScan } from '@/components/ocr-scan';
import { SpendStats } from '@/components/spend-stats';
import { CsvImport } from '@/components/csv-import';
import { ActivityFeed } from '@/components/activity-feed';

export function GroupDetail({ groupId }: { groupId: string }) {
  const { t, formatCurrency, formatDate } = useI18n();
  const group = trpc.group.get.useQuery({ groupId });
  const transactions = trpc.transaction.list.useQuery({ groupId });
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const createInvite = trpc.invite.create.useMutation({
    onSuccess: (invite) => {
      setInviteUrl(`${window.location.origin}/invite/${invite.token}`);
    },
  });

  if (group.isLoading) return <p className="text-neutral-500">{t('common.loading')}</p>;
  if (group.isError || !group.data) {
    return (
      <Card>
        <p className="text-red-700 dark:text-red-400">{t('error.notFound')}</p>
        <Link href="/" className="mt-2 inline-block text-brand-700 underline">
          {t('common.back')}
        </Link>
      </Card>
    );
  }

  const activeMembers = group.data.members.filter((m) => m.isActive);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/" className="text-xs text-neutral-500 hover:underline">
            ← {t('nav.groups')}
          </Link>
          <h1 className="text-2xl font-bold" data-testid="group-title">
            {group.data.name}
          </h1>
        </div>
        <Button
          variant="ghost"
          onClick={() => createInvite.mutate({ groupId })}
          data-testid="invite-btn"
        >
          {t('invite.create')}
        </Button>
      </div>

      {inviteUrl ? (
        <Card>
          <p className="mb-1 text-sm font-medium">{t('invite.link')}</p>
          <code className="break-all text-xs text-brand-700" data-testid="invite-url">
            {inviteUrl}
          </code>
        </Card>
      ) : null}

      <Card>
        <h3 className="mb-3 font-semibold">{t('group.members')}</h3>
        <MemberList
          groupId={groupId}
          members={activeMembers.map((m) => ({
            id: m.id,
            displayName: m.displayName,
            initials: m.initials,
            color: m.color,
          }))}
        />
        <AddMemberForm groupId={groupId} />
      </Card>

      {activeMembers.length > 0 ? (
        <>
          <AddExpenseForm
            groupId={groupId}
            members={activeMembers.map((m) => ({
              id: m.id,
              displayName: m.displayName,
              initials: m.initials,
              color: m.color,
            }))}
            baseCurrency={group.data.baseCurrency}
          />
          <OcrScan
            groupId={groupId}
            members={activeMembers.map((m) => ({
              id: m.id,
              displayName: m.displayName,
              initials: m.initials,
              color: m.color,
            }))}
            baseCurrency={group.data.baseCurrency}
          />
        </>
      ) : null}

      <BalancesPanel
        groupId={groupId}
        members={activeMembers.map((m) => ({
          id: m.id,
          displayName: m.displayName,
          initials: m.initials,
          color: m.color,
        }))}
        baseCurrency={group.data.baseCurrency}
      />

      <SpendStats groupId={groupId} baseCurrency={group.data.baseCurrency} />

      {activeMembers.length > 0 ? (
        <>
          <CsvImport
            groupId={groupId}
            members={activeMembers.map((m) => ({ id: m.id, displayName: m.displayName }))}
          />
          <BankDetailsForm
            members={activeMembers.map((m) => ({ id: m.id, displayName: m.displayName }))}
          />
        </>
      ) : null}

      <Card>
        <h3 className="mb-3 font-semibold">{t('nav.transactions')}</h3>
        {transactions.data && transactions.data.length > 0 ? (
          <ul
            className="divide-y divide-neutral-100 dark:divide-neutral-800"
            data-testid="transactions-list"
          >
            {transactions.data.map((tx) => (
              <li key={tx.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium">{tx.title}</p>
                  <p className="text-xs text-neutral-500">
                    {tx.type === 'TRANSFER' ? t('expense.transfer') : ''} {formatDate(tx.date)}
                  </p>
                  {tx.hasReceiptImage ? (
                    <a
                      href={`/api/receipts/${tx.receiptId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-brand-700 underline"
                      data-testid="view-receipt"
                    >
                      {t('receipt.view')}
                    </a>
                  ) : null}
                </div>
                <span className="text-right text-sm">
                  {formatCurrency(Number(tx.baseMinorUnits), group.data.baseCurrency)}
                  {tx.currency !== group.data.baseCurrency ? (
                    <span className="block text-xs text-neutral-500">
                      {formatCurrency(Number(tx.totalMinorUnits), tx.currency)}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-center text-sm text-neutral-500">—</p>
        )}
      </Card>

      <ActivityFeed
        groupId={groupId}
        members={activeMembers.map((m) => ({ id: m.id, displayName: m.displayName }))}
        baseCurrency={group.data.baseCurrency}
      />
    </div>
  );
}
