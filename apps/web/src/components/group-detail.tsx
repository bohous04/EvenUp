'use client';
import { useState } from 'react';
import { AppLink } from '@/components/app-link';
import { visibleAvatar } from '@evenup/core';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/auth-client';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import {
  Button,
  Card,
  EmptyState,
  Panel,
  Section,
  iconButtonClass,
  rowClass,
} from '@/components/ui';
import { AmountText } from '@/components/amount-text';
import { AvatarStack, MemberChip } from '@/components/member-chip';
import { MemberList } from '@/components/member-list';
import { DuplicateBanner } from '@/components/merge-members';
import { AlreadyMemberBanner } from '@/components/already-member-banner';
import { AddMemberForm } from '@/components/add-member-form';
import { AddExpenseForm } from '@/components/add-expense-form';
import { OfflineQueueBadge } from '@/components/offline-queue-badge';
import { useExpenseQueue } from '@/lib/offline/use-expense-queue';
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
  ChevronDown,
  Copy,
  Check,
  Share2,
  ReceiptText,
  HandCoins,
} from '@/components/icons';

/** The receipt link under a transaction row: aligned with the title, 44px tall. */
const receiptLinkClass =
  'ml-16 -mt-3 inline-flex min-h-11 items-center text-[0.8125rem] font-medium text-[var(--app-ink-2)] underline decoration-[var(--app-line-2)] underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600';

type SheetPanel = 'members' | 'invite' | 'stats' | 'activity' | 'csv' | 'categories' | null;
type Transaction = RouterOutputs['transaction']['list'][number];

export function GroupDetail({
  groupId,
  alreadyMemberNotice = false,
  openAddExpense = false,
}: {
  groupId: string;
  alreadyMemberNotice?: boolean;
  /** Arrived from the groups home's "Add expense" (`?add=1`): open its sheet. */
  openAddExpense?: boolean;
}) {
  const { t, plural, locale, formatCurrency } = useI18n();
  const group = trpc.group.get.useQuery({ groupId });
  const transactions = trpc.transaction.list.useQuery({ groupId });
  const stats = trpc.stats.byCategory.useQuery({ groupId });
  const customCategories = trpc.category.list.useQuery({ groupId });
  const { data: session } = useSession();

  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<SheetPanel>(null);
  const [showAll, setShowAll] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [viewingReceiptTx, setViewingReceiptTx] = useState<Transaction | null>(null);

  /*
   * A second view of the same queue as the add-expense form's. Both read the
   * module-level IndexedDB store and both re-read after a drain, so the badge
   * and the form never disagree — and a duplicate listener on `online` costs
   * nothing next to the alternative of threading the hook through props.
   */
  const queueCreate = trpc.transaction.createExpense.useMutation();
  const queueRecur = trpc.transaction.setRecurrence.useMutation();
  const queue = useExpenseQueue({
    send: async (item) => {
      const { _recurrence, ...payload } = item.payload as Record<string, unknown> & {
        _recurrence?: string;
      };
      const created = await queueCreate.mutateAsync({
        ...(payload as Parameters<typeof queueCreate.mutateAsync>[0]),
        clientMutationId: item.id,
      });
      if (_recurrence) {
        await queueRecur.mutateAsync({
          transactionId: created.id,
          interval: _recurrence as never,
        });
      }
    },
    onSynced: () => {
      void transactions.refetch();
      void group.refetch();
    },
  });

  const createInvite = trpc.invite.create.useMutation({
    onSuccess: (invite) => {
      setInviteUrl(`${window.location.origin}/invite/${invite.token}`);
      setCopied(false);
    },
  });

  // Native share sheet where available (mobile); otherwise the copy button and
  // the visible link are the fallback. Guarded for SSR (no `navigator`).
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
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
        <AppLink href="/groups" className="mt-2 inline-block text-brand-600 underline">
          {t('common.back')}
        </AppLink>
      </Card>
    );
  }

  const activeMembers = group.data.members.filter((m) => m.isActive);
  /*
   * The viewer's own role, reported by `group.get`. Deliberately NOT derived
   * from the roster: the member projection carries no user id, so a client
   * cannot work out which row is "me", and guessing wrong would either hide the
   * add-expense button from someone who needs it or leave it showing for a
   * guest.
   */
  const isGuest = group.data.viewerRole === 'GUEST';
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
  }));
  // Payer chips on transaction rows use the raw member (incl. inactive), so map
  // memberId → profile picture separately from the active-only memberLite.
  const imageByMemberId = new Map(group.data.members.map((m) => [m.id, visibleAvatar(m.user)]));
  // Your own row (the member linked to your account), if you are on the roster.
  const myMember = session?.user?.id
    ? activeMembers.find((m) => m.userId === session.user.id)
    : undefined;
  const totalSpent = (stats.data ?? []).reduce((a, s) => a + Math.abs(s.totalMinorUnits), 0);
  const txs = transactions.data ?? [];
  const visibleTxs = showAll ? txs : txs.slice(0, 5);

  /*
   * Day headings over the history, the way a bank lists it: "Today",
   * "Yesterday", then "18 February" (with the year only outside this one).
   */
  const dayKey = (d: string | Date) => {
    const x = new Date(d);
    return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  };
  const dayLabel = (d: string | Date) => {
    const x = new Date(d);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (dayKey(x) === dayKey(now)) return t('transactions.today');
    if (dayKey(x) === dayKey(yesterday)) return t('transactions.yesterday');
    return new Intl.DateTimeFormat(locale === 'cs' ? 'cs-CZ' : 'en-GB', {
      day: 'numeric',
      month: 'long',
      ...(x.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
    }).format(x);
  };

  const openPanel = (p: Exclude<SheetPanel, null>) => {
    setMenuOpen(false);
    setPanel(p);
  };

  /*
   * `write: true` marks the menu entries whose panel can change the group.
   * A guest keeps the read-only ones (roster, stats, activity) and loses the
   * rest, so the menu never offers an action `assertGroupWrite` will refuse.
   */
  const menuItems = [
    {
      key: 'members',
      icon: Users,
      label: t('group.members'),
      onSelect: () => openPanel('members'),
      write: false,
    },
    {
      key: 'invite',
      icon: Mail,
      label: t('invite.create'),
      onSelect: () => openPanel('invite'),
      write: true,
    },
    {
      key: 'stats',
      icon: BarChart3,
      label: t('stats.spendByCategory'),
      onSelect: () => openPanel('stats'),
      write: false,
    },
    {
      key: 'categories',
      icon: Tags,
      label: t('group.categories'),
      onSelect: () => openPanel('categories'),
      write: true,
    },
    {
      key: 'activity',
      icon: History,
      label: t('nav.activity'),
      onSelect: () => openPanel('activity'),
      write: false,
    },
    {
      key: 'csv',
      icon: FileUp,
      label: t('csv.import'),
      onSelect: () => openPanel('csv'),
      write: true,
    },
  ].filter((item) => !isGuest || !item.write);

  return (
    <div className="xl:max-w-[72rem]">
      {/* Toolbar: back on the left, the group's options on the right — both
          44px targets on one line, the title free to take the full width. */}
      <div className="-ml-2 -mr-2 -mt-2 mb-1 flex items-center justify-between">
        <AppLink
          href="/groups"
          className="inline-flex h-11 items-center gap-0.5 rounded-full pl-1 pr-3 text-[0.9375rem] text-zinc-600 transition-colors hover:bg-zinc-100 active:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:active:bg-zinc-800"
        >
          <ChevronLeft size={20} strokeWidth={1.75} aria-hidden />
          {t('nav.groups')}
        </AppLink>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label={t('group.menu')}
          title={t('group.menu')}
          className={iconButtonClass}
          data-testid="group-menu-btn"
        >
          <MoreHorizontal size={22} aria-hidden />
        </button>
      </div>
      {/* Header: the group's name and who is in it. The people and the spend
          are taps (roster, spending by category) — the two questions a group
          gets asked most after "how much do I owe". */}
      <header className="app-gd-head">
        <h1
          className="text-[1.75rem] font-[600] leading-tight tracking-[-0.035em] [overflow-wrap:anywhere] lg:text-[2rem]"
          data-testid="group-title"
        >
          {group.data.name}
        </h1>
        <div className="app-gd-meta">
          <button
            type="button"
            className="app-gd-meta-btn"
            onClick={() => openPanel('members')}
            aria-label={`${t('group.members')}: ${plural('groups.row.members', activeMembers.length)}`}
            data-testid="group-members-btn"
          >
            <AvatarStack
              max={5}
              members={activeMembers.map((m) => ({
                id: m.id,
                initials: m.initials,
                color: m.color,
                displayName: m.displayName,
                image: visibleAvatar(m.user),
              }))}
            />
          </button>
          {totalSpent > 0 ? (
            <>
              <button
                type="button"
                className="app-gd-meta-btn app-gd-meta-spent"
                onClick={() => openPanel('stats')}
              >
                {t('group.spentTotal', {
                  total: formatCurrency(totalSpent, group.data.baseCurrency).replace(
                    / /g,
                    '\u00a0',
                  ),
                })}
              </button>
            </>
          ) : null}
        </div>
      </header>

      <div className="space-y-3 empty:hidden mb-6">
        <OfflineQueueBadge
          pending={queue.pending}
          stuckItems={queue.stuck}
          onRetry={() => void queue.drain()}
          onDiscard={(id) => void queue.discard(id)}
        />

        {isGuest ? (
          <p
            role="status"
            data-testid="guest-readonly-banner"
            className="rounded-xl border border-amber-300 bg-amber-50/70 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/20 dark:text-amber-200"
          >
            {t('group.readOnlyBanner')}
          </p>
        ) : null}

        <AlreadyMemberBanner groupId={groupId} show={alreadyMemberNotice} />

        <DuplicateBanner groupId={groupId} />
      </div>

      <div className="app-gd-grid">
        {/* Money: your position and the payments that settle it, the round
            advice right under it, then who pays whom among the others. */}
        <div className="app-gd-money">
          <SettleCard
            groupId={groupId}
            members={memberLite}
            baseCurrency={group.data.baseCurrency}
            groupName={group.data.name}
            myMemberId={myMember?.id}
            aside={<NextRoundCard groupId={groupId} baseCurrency={group.data.baseCurrency} />}
          />
        </div>

        {/* History, newest first, under day headings. */}
        <div className="app-gd-history">
          <Section
            title={t('nav.transactions')}
            className="app-gd-tx"
            trailing={
              txs.length > 0 ? <span className="app-section-meta">{txs.length}</span> : undefined
            }
          >
            {visibleTxs.length > 0 ? (
              <>
                <Panel as="ul" plain data-testid="transactions-list">
                  {visibleTxs.map((tx, i) => {
                    const payer = tx.payers[0]?.member;
                    const transfer = tx.type === 'TRANSFER';
                    const day = dayKey(tx.date);
                    const newDay = i === 0 || dayKey(visibleTxs[i - 1]!.date) !== day;
                    const paidByMe =
                      !!myMember && tx.payers.some((p) => p.memberId === myMember.id);
                    const myShareRaw = myMember
                      ? Number(
                          tx.splits.find((sp) => sp.memberId === myMember.id)?.computedMinorUnits ??
                            0,
                        )
                      : 0;
                    // Splits are in the expense's currency; show your share in
                    // the group's, scaled by the expense's own conversion.
                    const total = Number(tx.totalMinorUnits);
                    const myShare =
                      total > 0
                        ? Math.round((myShareRaw * Number(tx.baseMinorUnits)) / total)
                        : myShareRaw;
                    const from = transfer
                      ? group.data.members.find((m) => m.id === tx.fromMemberId)
                      : undefined;
                    const to = transfer
                      ? group.data.members.find((m) => m.id === tx.toMemberId)
                      : undefined;
                    const face = payer ?? from;
                    return (
                      <li key={tx.id} className={newDay ? 'app-gd-day-start' : undefined}>
                        {newDay ? <p className="app-gd-day">{dayLabel(tx.date)}</p> : null}
                        {/* The row is the tap target for editing; the receipt link sits
                            below it (a link can't be nested inside a button). */}
                        <button
                          type="button"
                          onClick={() => setEditingTx(tx)}
                          data-testid="transaction-row"
                          className={rowClass}
                        >
                          {face ? (
                            <MemberChip
                              initials={face.initials}
                              color={face.color}
                              name={face.displayName}
                              imageUrl={imageByMemberId.get(face.id) ?? null}
                            />
                          ) : (
                            <span className="app-gd-tx-mark" aria-hidden>
                              <HandCoins size={17} strokeWidth={1.9} />
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-[0.9375rem] font-medium leading-snug tracking-[-0.01em] [overflow-wrap:anywhere]">
                              {tx.title || t('transaction.settlement')}
                            </p>
                            <p className="truncate text-[0.8125rem] text-[var(--app-ink-2)]">
                              {transfer ? (
                                <>
                                  {t('expense.transfer')}
                                  {from && to ? ` · ${from.displayName} → ${to.displayName}` : ''}
                                </>
                              ) : (
                                (payer?.displayName ?? '')
                              )}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <AmountText
                              minorUnits={Number(tx.baseMinorUnits)}
                              currency={group.data.baseCurrency}
                              className="block text-[0.9375rem] font-medium"
                            />
                            {tx.currency !== group.data.baseCurrency ? (
                              <AmountText
                                minorUnits={Number(tx.totalMinorUnits)}
                                currency={tx.currency}
                                className="block text-[0.8125rem] text-[var(--app-ink-2)]"
                              />
                            ) : !transfer && myMember && (paidByMe || myShare > 0) ? (
                              <span className="block whitespace-nowrap text-[0.8125rem] tabular-nums text-[var(--app-ink-2)]">
                                {paidByMe
                                  ? t('groups.recentPaid')
                                  : t('groups.recentShare', {
                                      amount: formatCurrency(
                                        myShare,
                                        group.data.baseCurrency,
                                      ).replace(/ /g, '\u00a0'),
                                    })}
                              </span>
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
                              className={receiptLinkClass}
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
                              className={receiptLinkClass}
                              data-testid="view-receipt"
                            >
                              {t('receipt.view')}
                            </a>
                          )
                        ) : null}
                      </li>
                    );
                  })}
                </Panel>
                {!showAll && txs.length > 5 ? (
                  <button
                    type="button"
                    onClick={() => setShowAll(true)}
                    className="app-row app-section-foot flex min-h-12 w-full items-center gap-2 px-4 text-[0.9375rem] font-medium text-[var(--app-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600"
                    data-testid="tx-show-all"
                  >
                    {t('transactions.showMore')}
                    <ChevronDown size={16} aria-hidden />
                  </button>
                ) : null}
              </>
            ) : (
              <Panel flush>
                <EmptyState
                  icon={<ReceiptText size={22} aria-hidden />}
                  title={t('transactions.empty')}
                />
              </Panel>
            )}
          </Section>
        </div>

        {/* Everyone's standing: a step back, after what you act on and read. */}
        <div className="app-gd-standing">
          <BalancesCard groupId={groupId} baseCurrency={group.data.baseCurrency} />
        </div>
      </div>

      {/* Expense entry: a FAB opens the amount-first sheet (OCR scan lives inside it).
          Hidden for a guest — the server refuses the write regardless, so the FAB
          would only ever open a form that cannot be saved. */}
      {activeMembers.length > 0 ? (
        <AddExpenseForm
          groupId={groupId}
          members={memberLite}
          baseCurrency={group.data.baseCurrency}
          customCategories={customCategories.data ?? []}
          readOnly={isGuest}
          autoOpen={openAddExpense}
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
