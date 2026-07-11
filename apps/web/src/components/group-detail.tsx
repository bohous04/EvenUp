'use client';
import { useState } from 'react';
import Link from 'next/link';
import { visibleAvatar } from '@evenup/core';
import { useI18n } from '@/lib/i18n';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { Button, Card, SectionLabel, iconButtonClass } from '@/components/ui';
import { AmountText } from '@/components/amount-text';
import { MemberChip } from '@/components/member-chip';
import { MemberList } from '@/components/member-list';
import { AddMemberForm } from '@/components/add-member-form';
import { AddExpenseForm } from '@/components/add-expense-form';
import { EditTransferSheet } from '@/components/edit-transfer-sheet';
import { SettleCard } from '@/components/settle-card';
import { BalancesCard } from '@/components/balances-card';
import { NextRoundCard } from '@/components/next-round-card';
import { SpendStats } from '@/components/spend-stats';
import { CsvImport } from '@/components/csv-import';
import { ActivityFeed } from '@/components/activity-feed';
import { CategoryManager } from '@/components/category-manager';
import { Sheet } from '@/components/sheet';
import { MenuSheet } from '@/components/menu-sheet';
import { ReceiptViewer } from '@/components/receipt-viewer';
import {
  Users,
  Mail,
  BarChart3,
  History,
  FileUp,
  Tags,
  MoreHorizontal,
  ChevronLeft,
  Copy,
  Check,
  Share2,
} from '@/components/icons';

type Panel = 'members' | 'invite' | 'stats' | 'activity' | 'csv' | 'categories' | null;
type Transaction = RouterOutputs['transaction']['list'][number];

export function GroupDetail({ groupId }: { groupId: string }) {
  const { t, formatCurrency, formatDate } = useI18n();
  const group = trpc.group.get.useQuery({ groupId });
  const transactions = trpc.transaction.list.useQuery({ groupId });
  const stats = trpc.stats.byCategory.useQuery({ groupId });
  const customCategories = trpc.category.list.useQuery({ groupId });

  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [showAll, setShowAll] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [viewingReceiptTx, setViewingReceiptTx] = useState<Transaction | null>(null);

  const createInvite = trpc.invite.create.useMutation({
    onSuccess: (invite) => {
      setInviteUrl(`${window.location.origin}/invite/${invite.token}`);
      setCopied(false);
    },
  });

  // Native share sheet where available (mobile); otherwise the copy button and
  // the visible link are the fallback. Guarded for SSR (no `navigator`).
  const canShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const copyInvite = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context / permissions) — the link stays
      // visible for manual copy, so this is a non-fatal best-effort.
    }
  };
  const shareInvite = async () => {
    if (!inviteUrl || !canShare) return;
    try {
      await navigator.share({ title: group.data?.name, url: inviteUrl });
    } catch {
      // User dismissed the share sheet — nothing to do.
    }
  };

  if (group.isLoading)
    return <p className="text-zinc-500 dark:text-zinc-400">{t('common.loading')}</p>;
  if (group.isError || !group.data) {
    return (
      <Card>
        <p className="text-red-700 dark:text-red-400">{t('error.notFound')}</p>
        <Link href="/" className="mt-2 inline-block text-brand-600 underline">
          {t('common.back')}
        </Link>
      </Card>
    );
  }

  const activeMembers = group.data.members.filter((m) => m.isActive);
  const memberLite = activeMembers.map((m) => ({
    id: m.id,
    displayName: m.displayName,
    initials: m.initials,
    color: m.color,
    // `visibleAvatar` honors the member's "hide my photo" preference everywhere.
    imageUrl: visibleAvatar(m.user),
    // Whether a user account is linked, and (admin-gated server-side) its email —
    // so the roster shows who is connected and, for admins, with which address.
    connected: m.userId != null,
    linkedEmail: m.user?.email ?? null,
  }));
  // Payer chips on transaction rows use the raw member (incl. inactive), so map
  // memberId → profile picture separately from the active-only memberLite.
  const imageByMemberId = new Map(group.data.members.map((m) => [m.id, visibleAvatar(m.user)]));
  const totalSpent = (stats.data ?? []).reduce((a, s) => a + Math.abs(s.totalMinorUnits), 0);
  const txs = transactions.data ?? [];
  const visibleTxs = showAll ? txs : txs.slice(0, 5);

  const openPanel = (p: Exclude<Panel, null>) => {
    setMenuOpen(false);
    setPanel(p);
  };

  const menuItems = [
    {
      key: 'members',
      icon: Users,
      label: t('group.members'),
      onSelect: () => openPanel('members'),
    },
    { key: 'invite', icon: Mail, label: t('invite.create'), onSelect: () => openPanel('invite') },
    {
      key: 'stats',
      icon: BarChart3,
      label: t('stats.spendByCategory'),
      onSelect: () => openPanel('stats'),
    },
    {
      key: 'categories',
      icon: Tags,
      label: t('group.categories'),
      onSelect: () => openPanel('categories'),
    },
    {
      key: 'activity',
      icon: History,
      label: t('nav.activity'),
      onSelect: () => openPanel('activity'),
    },
    { key: 'csv', icon: FileUp, label: t('csv.import'), onSelect: () => openPanel('csv') },
  ];

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/"
            className="inline-flex items-center gap-0.5 text-xs text-zinc-500 hover:underline dark:text-zinc-400"
          >
            <ChevronLeft size={13} aria-hidden />
            {t('nav.groups')}
          </Link>
          <h1 className="truncate text-2xl font-extrabold tracking-tight" data-testid="group-title">
            {group.data.name}
          </h1>
          {totalSpent > 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {t('group.spentTotal', {
                total: formatCurrency(totalSpent, group.data.baseCurrency),
              })}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label={t('group.menu')}
          title={t('group.menu')}
          className={iconButtonClass}
          data-testid="group-menu-btn"
        >
          <MoreHorizontal size={20} aria-hidden />
        </button>
      </div>

      <NextRoundCard groupId={groupId} baseCurrency={group.data.baseCurrency} />

      <BalancesCard groupId={groupId} baseCurrency={group.data.baseCurrency} />

      {/* Recent transactions */}
      <Card>
        <SectionLabel>{t('nav.transactions')}</SectionLabel>
        {visibleTxs.length > 0 ? (
          <>
            <ul
              className="divide-y divide-zinc-100 dark:divide-zinc-800"
              data-testid="transactions-list"
            >
              {visibleTxs.map((tx) => {
                const payer = tx.payers[0]?.member;
                return (
                  <li key={tx.id} className="py-1">
                    {/* The row is the tap target for editing; the receipt link sits
                        below it (a link can't be nested inside a button). */}
                    <button
                      type="button"
                      onClick={() => setEditingTx(tx)}
                      data-testid="transaction-row"
                      className="flex w-full items-center gap-3 rounded-xl px-1 py-1.5 text-left transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 dark:hover:bg-zinc-800"
                    >
                      {payer ? (
                        <MemberChip
                          initials={payer.initials}
                          color={payer.color}
                          name={payer.displayName}
                          imageUrl={imageByMemberId.get(payer.id) ?? null}
                          size="sm"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{tx.title}</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {tx.type === 'TRANSFER'
                            ? t('expense.transfer')
                            : (payer?.displayName ?? '')}{' '}
                          · {formatDate(tx.date)}
                        </p>
                      </div>
                      <div className="text-right">
                        <AmountText
                          minorUnits={Number(tx.baseMinorUnits)}
                          currency={group.data.baseCurrency}
                          className="text-sm font-semibold"
                        />
                        {tx.currency !== group.data.baseCurrency ? (
                          <AmountText
                            minorUnits={Number(tx.totalMinorUnits)}
                            currency={tx.currency}
                            className="block text-xs text-zinc-500 dark:text-zinc-400"
                          />
                        ) : null}
                      </div>
                    </button>
                    {tx.hasReceiptImage && tx.receiptId ? (
                      (tx.receiptPageCount ?? 0) > 1 ? (
                        // Multiple pages: open the in-app lightbox so all pages
                        // are reachable, rather than a link that only ever
                        // resolves page 0.
                        <button
                          type="button"
                          onClick={() => setViewingReceiptTx(tx)}
                          className="ml-11 text-xs text-brand-600 underline"
                          data-testid="view-receipt"
                        >
                          {t('receipt.viewCount', { count: tx.receiptPageCount })}
                        </button>
                      ) : (
                        // A single page (one image, or a PDF) — the plain link
                        // works for both; no lightbox needed.
                        <a
                          href={`/api/receipts/${tx.receiptId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-11 text-xs text-brand-600 underline"
                          data-testid="view-receipt"
                        >
                          {t('receipt.view')}
                        </a>
                      )
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {!showAll && txs.length > 5 ? (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="mt-2 w-full rounded-xl py-2 text-center text-sm font-semibold text-brand-600 transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 dark:hover:bg-brand-600/10"
                data-testid="tx-show-all"
              >
                {t('transactions.showMore')}
              </button>
            ) : null}
          </>
        ) : (
          <p className="py-2 text-center text-sm text-zinc-500 dark:text-zinc-400">—</p>
        )}
      </Card>

      <SettleCard groupId={groupId} members={memberLite} baseCurrency={group.data.baseCurrency} />

      {/* Expense entry: a FAB opens the amount-first sheet (OCR scan lives inside it). */}
      {activeMembers.length > 0 ? (
        <AddExpenseForm
          groupId={groupId}
          members={memberLite}
          baseCurrency={group.data.baseCurrency}
          customCategories={customCategories.data ?? []}
        />
      ) : null}

      {/* Tapping a transaction opens it for in-place editing — expenses reuse the
          amount-first sheet (prefilled); settlements use their own editor. */}
      {editingTx && editingTx.type !== 'TRANSFER' ? (
        <AddExpenseForm
          key={editingTx.id}
          groupId={groupId}
          members={memberLite}
          baseCurrency={group.data.baseCurrency}
          customCategories={customCategories.data ?? []}
          editing={editingTx}
          onClose={() => setEditingTx(null)}
        />
      ) : null}
      {editingTx && editingTx.type === 'TRANSFER' ? (
        <EditTransferSheet
          key={editingTx.id}
          transaction={editingTx}
          members={memberLite}
          onClose={() => setEditingTx(null)}
        />
      ) : null}

      {viewingReceiptTx && viewingReceiptTx.receiptId ? (
        <ReceiptViewer
          key={viewingReceiptTx.id}
          receiptId={viewingReceiptTx.receiptId}
          pageCount={viewingReceiptTx.receiptPageCount ?? 0}
          onClose={() => setViewingReceiptTx(null)}
        />
      ) : null}

      {/* ⋯ menu + feature sheets */}
      <MenuSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={t('group.menu')}
        items={menuItems}
      />

      <Sheet open={panel === 'members'} onClose={() => setPanel(null)} title={t('group.members')}>
        <MemberList groupId={groupId} members={memberLite} />
        <AddMemberForm groupId={groupId} />
      </Sheet>

      <Sheet open={panel === 'invite'} onClose={() => setPanel(null)} title={t('invite.create')}>
        <div className="space-y-3">
          <Button
            onClick={() => createInvite.mutate({ groupId })}
            disabled={createInvite.isPending}
            data-testid="invite-btn"
          >
            {createInvite.isPending ? t('common.loading') : t('invite.create')}
          </Button>
          {inviteUrl ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('invite.link')}</p>
              <code
                className="block truncate rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-2 text-xs text-brand-600 dark:border-zinc-800 dark:bg-zinc-800/50"
                data-testid="invite-url"
              >
                {inviteUrl}
              </code>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={copyInvite}
                  data-testid="invite-copy-btn"
                >
                  {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
                  {copied ? t('invite.copied') : t('invite.copy')}
                </Button>
                {canShare ? (
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={shareInvite}
                    data-testid="invite-share-btn"
                  >
                    <Share2 size={16} aria-hidden />
                    {t('invite.share')}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </Sheet>

      <Sheet
        open={panel === 'stats'}
        onClose={() => setPanel(null)}
        title={t('stats.spendByCategory')}
      >
        <SpendStats
          groupId={groupId}
          baseCurrency={group.data.baseCurrency}
          customCategories={customCategories.data ?? []}
        />
      </Sheet>

      <Sheet
        open={panel === 'categories'}
        onClose={() => setPanel(null)}
        title={t('group.categories')}
      >
        <CategoryManager groupId={groupId} />
      </Sheet>

      <Sheet open={panel === 'activity'} onClose={() => setPanel(null)} title={t('nav.activity')}>
        <ActivityFeed
          groupId={groupId}
          members={activeMembers.map((m) => ({ id: m.id, displayName: m.displayName }))}
          baseCurrency={group.data.baseCurrency}
        />
      </Sheet>

      <Sheet open={panel === 'csv'} onClose={() => setPanel(null)} title={t('csv.import')}>
        <CsvImport
          groupId={groupId}
          members={activeMembers.map((m) => ({ id: m.id, displayName: m.displayName }))}
        />
      </Sheet>
    </div>
  );
}
