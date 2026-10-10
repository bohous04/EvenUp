'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppLink } from '@/components/app-link';
import { visibleAvatar } from '@evenup/core';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Button, Input, Label, Painted, Panel, Section, Select, rowClass } from '@/components/ui';
import { AmountText } from '@/components/amount-text';
import { MemberChip } from '@/components/member-chip';
import { Sheet } from '@/components/sheet';
import { Fab } from '@/components/fab';
import { LocaleToggle } from '@/components/locale-toggle';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  GroupIcon,
  Plus,
  ReceiptText,
} from '@/components/icons';
import { localizedPath } from '@/lib/locale-path';
import { useSession } from '@/lib/auth-client';
import { COMMON_CURRENCIES } from '@/lib/currencies';

const TEMPLATES = ['TRIP', 'HOUSEHOLD', 'COUPLE', 'EVENT', 'OTHER'] as const;
type Template = (typeof TEMPLATES)[number];

export function GroupsDashboard() {
  const { t, plural, locale, formatCurrency } = useI18n();
  const router = useRouter();
  const utils = trpc.useUtils();
  const groups = trpc.group.list.useQuery();
  const { data: session } = useSession();
  const myId = session?.user?.id;
  /*
   * Where *you* stand in each group: your own member row (the one linked to
   * your account) looked up in the same `balance.get` the group screen uses,
   * batched into one request. Positive = the group owes you. A group you
   * created without being on its roster falls back to what it still has to
   * settle (the sum of its suggested payments), labelled as such.
   */
  const list = groups.data ?? [];
  const balances = trpc.useQueries((q) => list.map((g) => q.balance.get({ groupId: g.id })));
  /*
   * What happened lately, across every group you can see: the newest entry
   * per group dates its row ("2 days ago"), and the newest three are the
   * "Recent" band under the list — Mercury's recent transactions under the
   * accounts, so the thumb half of a phone holds news, not empty ground.
   */
  const feed = trpc.activity.feed.useQuery({ limit: 50 }, { enabled: list.length > 0 });
  const lastById = new Map<string, Date>();
  for (const it of feed.data?.items ?? []) {
    if (!lastById.has(it.groupId)) lastById.set(it.groupId, new Date(it.createdAt));
  }
  /*
   * r58 — "Recent" is money, not a log: the newest transactions across your
   * groups (Mercury's recent transactions), each with who paid as the row's
   * anchor, the amount at the right edge and your share under it. A few rows
   * per group, newest groups first, merged and cut to eight (phones show
   * three, so the list ends above the bar; lg fills the side column).
   */
  const recentGroups = list.slice(0, 8);
  const txs = trpc.useQueries((q) =>
    recentGroups.map((g) => q.transaction.list({ groupId: g.id, limit: 4 })),
  );
  const recentPending = txs.some((r) => r.isLoading);
  const recent = recentGroups
    .flatMap((g, i) => (txs[i]?.data ?? []).map((tx) => ({ tx, g })))
    .sort((a, b) => new Date(b.tx.createdAt).getTime() - new Date(a.tx.createdAt).getTime())
    .slice(0, 8);
  type Position = { kind: 'mine' | 'open'; value: number };
  const positionById = new Map<string, Position>();
  list.forEach((g, i) => {
    const data = balances[i]?.data;
    if (!data) return;
    const me = myId ? g.members.find((m) => m.isActive && m.userId === myId) : undefined;
    const mine = me ? data.balances.find((b) => b.memberId === me.id) : undefined;
    positionById.set(
      g.id,
      mine
        ? { kind: 'mine', value: mine.balanceMinorUnits }
        : { kind: 'open', value: data.payments.reduce((a, p) => a + p.amountMinorUnits, 0) },
    );
  });
  /*
   * Your side of every group's suggested payments, across groups: who you pay
   * and who pays you, largest first. It is the same minimal set the group
   * screen shows, filtered to the rows that involve you, so home answers
   * "what do I do next" without opening each group.
   */
  type MyPayment = {
    key: string;
    groupId: string;
    groupName: string;
    currency: string;
    youPay: boolean;
    amount: number;
    other: (typeof list)[number]['members'][number];
  };
  const myPayments: MyPayment[] = [];
  list.forEach((g, i) => {
    const data = balances[i]?.data;
    const me = myId ? g.members.find((m) => m.isActive && m.userId === myId) : undefined;
    if (!data || !me) return;
    data.payments.forEach((p, j) => {
      const youPay = p.fromMemberId === me.id;
      if (!youPay && p.toMemberId !== me.id) return;
      const other = g.members.find((m) => m.id === (youPay ? p.toMemberId : p.fromMemberId));
      if (!other) return;
      myPayments.push({
        key: `${g.id}-${j}`,
        groupId: g.id,
        groupName: g.name,
        currency: g.baseCurrency,
        youPay,
        amount: p.amountMinorUnits,
        other,
      });
    });
  });
  // What you owe first (it is yours to act on), then the largest amounts.
  myPayments.sort((a, b) => Number(b.youPay) - Number(a.youPay) || b.amount - a.amount);
  const ready = list.length > 0 && positionById.size === list.length;
  // Per currency, in list order: a mixed-currency account gets one figure per
  // currency on each side, never a sum across them.
  const owed = new Map<string, number>();
  const owe = new Map<string, number>();
  const openTotals = new Map<string, number>();
  for (const g of list) {
    const p = positionById.get(g.id);
    if (!p || p.value === 0) continue;
    const bucket = p.kind === 'open' ? openTotals : p.value > 0 ? owed : owe;
    bucket.set(g.baseCurrency, (bucket.get(g.baseCurrency) ?? 0) + Math.abs(p.value));
  }
  const allSquare = ready && owed.size === 0 && owe.size === 0 && openTotals.size === 0;
  const createGroup = trpc.group.create.useMutation({
    onSuccess: () => {
      void utils.group.list.invalidate();
      setOpen(false);
      setName('');
      setTemplate('OTHER');
    },
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<(typeof COMMON_CURRENCIES)[number]>('CZK');
  const [template, setTemplate] = useState<Template>('OTHER');
  const [picking, setPicking] = useState(false);
  const [sheet, setSheet] = useState<null | 'all'>(null);

  const toPay = ready ? myPayments.filter((p) => p.youPay) : [];
  // Groups you can write to (a guest's would only open a read-only screen).
  const writable = list.filter((g) => g.members.some((m) => m.isActive && m.userId === myId));
  const addTargets = writable.length > 0 ? writable : list;
  const addExpense = () => {
    const only = addTargets.length === 1 ? addTargets[0] : undefined;
    if (only) router.push(`${localizedPath(`/groups/${only.id}`, locale)}?add=1`);
    else setPicking(true);
  };
  const incoming = ready ? myPayments.filter((p) => !p.youPay) : [];
  /*
   * A section's total, set where its count used to be: one currency → the
   * sum (the figure the hero no longer splits out), several → the count, as
   * sums across currencies would be meaningless.
   */
  const sectionTotal = (rows: MyPayment[]) => {
    const curs = new Set(rows.map((r) => r.currency));
    const only = curs.size === 1 ? [...curs][0] : undefined;
    return only ? (
      <AmountText
        minorUnits={rows.reduce((a, r) => a + r.amount, 0)}
        currency={only}
        className="app-section-meta"
      />
    ) : (
      <span className="app-section-meta">{rows.length}</span>
    );
  };
  // Every payment that involves you, both ways: the summary opens them.
  const hasPayments = toPay.length > 0 || incoming.length > 0;
  /*
   * The list waits for the balances as well as the groups: the to-pay card
   * lands above it, so rows drawn before it would be pushed down. One
   * skeleton until both are in, then everything at once — no shift.
   */
  const balancesPending = list.length > 0 && (balances.some((b) => b.isLoading) || feed.isLoading);
  const hasList = list.length > 0 || groups.isLoading;
  const listReady = !groups.isLoading && !balancesPending;
  /*
   * r57 — the list leads. Above it sits one compact strip that splits your
   * money once, without overlap: what you pay | what comes to you, each a
   * 44px+ button into the payments sheet. No net figure (it was the
   * difference of the two, a third number for the same money) and no
   * separate to-pay card. Group rows then carry one quiet ink figure each;
   * the words under it say the direction. lg: the same single column,
   * wider type, not a dashboard of small columns.
   */
  /*
   * r90 — the screen's primary action lives in the thumb zone, not in the
   * content: phones get "Add expense" as the ink key at the right end of the
   * bottom dock, beside the tab capsule (fab.tsx / app.css "r90"), on every
   * scroll position; lg docks it at the top of the rail. With no groups yet
   * the same key is "New group". "New group" with groups is the list's own
   * last row (Mercury's "Open account"), where you look for it.
   */
  const dockAction = hasList ? (
    <Fab
      label={t('expense.add')}
      shortLabel={t('expense.addShort')}
      onClick={addExpense}
      disabled={list.length === 0}
      data-testid="home-add-expense"
    />
  ) : (
    <Fab
      label={t('group.create')}
      shortLabel={t('groups.newShort')}
      onClick={() => setOpen(true)}
      data-testid="new-group-btn"
    />
  );
  const newGroupRow = (
    <li>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="app-row app-hm-row app-hm-newrow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600"
        data-testid="new-group-btn"
      >
        <span className="app-hm-newplate" aria-hidden>
          <Plus size={18} strokeWidth={2.25} />
        </span>
        <span className="app-hm-newlabel">{t('groups.new')}</span>
      </button>
    </li>
  );
  return (
    <div className={hasList ? 'app-hm' : undefined}>
      <div className="app-hm-title">
        <h1 className="text-[1.75rem] font-[600] leading-tight tracking-[-0.035em] lg:text-[2.25rem]">
          {t('nav.groups')}
        </h1>
        {/* Phones keep language off the tab bar; home is where a first-time
            visitor in the wrong language looks for it (lg: the rail's row). */}
        <LocaleToggle className="app-hm-lang" />
      </div>

      {hasList ? (
        <>
          <section
            aria-live="polite"
            aria-label={t('groups.yourPayments')}
            className="app-hm-standing"
            data-testid="groups-net"
          >
            {!ready ? (
              <div aria-hidden className="app-hm-pos app-hm-pos-r63 app-hm-skel">
                <div className="app-hm-one">
                  <span className="block h-5 w-24 rounded bg-[var(--app-sunken)]" />
                  <span className="mt-1 block h-11 w-52 rounded-lg bg-[var(--app-sunken)]" />
                  <span className="mt-2 block h-7 w-40 rounded-full bg-[var(--app-sunken)]" />
                </div>
              </div>
            ) : allSquare || !hasPayments ? (
              <p className="app-hm-note">
                {allSquare ? (
                  <>
                    <Check
                      size={18}
                      strokeWidth={2}
                      aria-hidden
                      className="shrink-0 text-[var(--app-ink-2)]"
                    />
                    {t('groups.allSettled')}
                  </>
                ) : (
                  [...openTotals].map(([cur, v]) => (
                    <span key={cur} className="inline-flex items-baseline gap-1.5">
                      {t('groups.toSettle')}
                      <AmountText
                        minorUnits={v}
                        currency={cur}
                        className="font-semibold text-[var(--app-ink)]"
                      />
                    </span>
                  ))
                )}
              </p>
            ) : (
              <NetPosition owe={toPay} owed={incoming} onOpen={() => setSheet('all')} />
            )}
          </section>
          {ready && hasPayments && openTotals.size > 0 ? (
            <p className="app-hm-open">
              {[...openTotals].map(([cur, v]) => (
                <span key={cur} className="inline-flex items-baseline gap-1.5">
                  {t('groups.toSettle')}
                  <AmountText
                    minorUnits={v}
                    currency={cur}
                    className="font-semibold text-[var(--app-ink)]"
                  />
                </span>
              ))}
            </p>
          ) : null}

          <section className="app-hm-groups" aria-busy={listReady ? undefined : 'true'}>
            <h2 className="app-hm-head">{t('groups.list')}</h2>
            <ul className="app-hm-list">
              {!listReady
                ? (list.length > 0 ? list : [0, 1, 2]).map((_, i) => (
                    <li key={i} aria-hidden className="app-hm-row">
                      <span className="h-11 w-11 shrink-0 rounded-xl bg-[var(--app-sunken)]" />
                      <span className="min-w-0 flex-1">
                        <span className="block h-4 w-32 rounded bg-[var(--app-sunken)]" />
                        <span className="mt-2 block h-3 w-24 rounded bg-[var(--app-sunken)]" />
                      </span>
                      <span className="h-4 w-16 rounded bg-[var(--app-sunken)]" />
                    </li>
                  ))
                : list.map((g) => {
                    const p = positionById.get(g.id);
                    const label = !p
                      ? null
                      : p.value === 0
                        ? t('group.settledShort')
                        : p.kind === 'open'
                          ? t('groups.row.open')
                          : p.value > 0
                            ? t('groups.row.owed')
                            : t('groups.row.owe');
                    const people = g.members.filter((m) => m.isActive).length;
                    const last = lastById.get(g.id);
                    return (
                      <li key={g.id}>
                        <AppLink
                          href={`/groups/${g.id}`}
                          className="app-row app-hm-row focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600"
                        >
                          <GroupFaces groupId={g.id} members={g.members} myId={myId} />
                          <span className="min-w-0 flex-1">
                            <span className="app-hm-name">{g.name}</span>
                            <span className="app-hm-sub">
                              {p && p.value !== 0 ? (
                                <span
                                  className={`shrink-0 ${p.kind === 'open' ? '' : p.value < 0 ? 'app-hm-r78-word-owe' : 'app-hm-r78-word-in'}`}
                                >
                                  {label}
                                </span>
                              ) : (
                                <span className="shrink-0">
                                  {plural('groups.row.members', people)}
                                </span>
                              )}
                              <span aria-hidden className="shrink-0">
                                ·
                              </span>
                              {last ? (
                                <span className="min-w-0 truncate">
                                  <span className="sr-only">{t('groups.lastActivity')} </span>
                                  <time dateTime={last.toISOString()}>
                                    {ago(last, locale, 'short')}
                                  </time>
                                </span>
                              ) : (
                                <span className="min-w-0 truncate">
                                  {plural('group.transactions', g._count.transactions)}
                                </span>
                              )}
                            </span>
                          </span>
                          {/* r79 — one figure at the right edge, on one
                            line. Your balance is signed and coloured both
                            ways: +green when you are owed, −rust when you
                            owe, so a balance never reads like the neutral
                            prices in Recent below. The direction is also
                            said in words on the meta line (never colour
                            alone). Settled groups say so in muted text
                            instead of a zero. */}
                          <span className="app-hm-end app-hm-end-r78">
                            {!p ? null : p.value === 0 || p.kind === 'open' ? (
                              p.value === 0 ? (
                                <span className="app-hm-even">{label}</span>
                              ) : (
                                <span className="app-hm-r78-fig">
                                  <AmountText
                                    minorUnits={p.value}
                                    currency={g.baseCurrency}
                                    display
                                  />
                                </span>
                              )
                            ) : (
                              <span
                                className={`app-hm-r78-fig ${p.value < 0 ? 'app-hm-r78-owe' : 'app-hm-r78-in'}`}
                              >
                                <AmountText
                                  minorUnits={p.value}
                                  currency={g.baseCurrency}
                                  signed
                                  display
                                />
                              </span>
                            )}
                          </span>
                        </AppLink>
                      </li>
                    );
                  })}
              {newGroupRow}
            </ul>
          </section>

          {listReady && !recentPending && recent.length > 0 ? (
            <section className="app-hm-recent" data-testid="groups-recent">
              <h2 className="app-hm-head">{t('groups.recent')}</h2>
              <ul className="app-hm-list app-hm-list-rec">
                {recent.map(({ tx, g }) => {
                  const transfer = tx.type === 'TRANSFER';
                  const payerId = tx.payers[0]?.memberId ?? tx.fromMemberId ?? undefined;
                  const payer = g.members.find((m) => m.id === payerId);
                  const to = transfer ? g.members.find((m) => m.id === tx.toMemberId) : undefined;
                  const me = myId
                    ? g.members.find((m) => m.isActive && m.userId === myId)
                    : undefined;
                  const paidByMe = !!me && tx.payers.some((p) => p.memberId === me.id);
                  const myShare = me
                    ? Number(tx.splits.find((s) => s.memberId === me.id)?.computedMinorUnits ?? 0)
                    : 0;
                  const created = new Date(tx.createdAt);
                  return (
                    <li key={tx.id}>
                      <AppLink
                        href={`/groups/${g.id}`}
                        className="app-row app-hm-row app-hm-tx focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600"
                      >
                        {payer ? (
                          <MemberChip
                            size="sm"
                            initials={payer.initials}
                            color={payer.color}
                            name={payer.displayName}
                            imageUrl={visibleAvatar(payer.user)}
                          />
                        ) : (
                          <span className="app-group-mark app-hm-tx-mark" aria-hidden>
                            <ReceiptText size={18} strokeWidth={1.9} />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="app-hm-tx-title">
                            {transfer && payer && to ? (
                              <>
                                <span className="min-w-0 truncate">{payer.displayName}</span>
                                <ArrowRight
                                  size={14}
                                  aria-hidden
                                  className="shrink-0 text-[var(--app-ink-3)]"
                                />
                                <span className="min-w-0 truncate">{to.displayName}</span>
                              </>
                            ) : (
                              <span className="min-w-0 truncate">
                                {tx.title || t('transaction.settlement')}
                              </span>
                            )}
                          </span>
                          <span className="app-hm-sub">
                            {!transfer && payer ? (
                              <>
                                <span className="shrink-0">{payer.displayName}</span>
                                <span aria-hidden className="shrink-0">
                                  ·
                                </span>
                              </>
                            ) : null}
                            <Painted text={g.name} className="min-w-0 truncate" />
                            <time className="sr-only" dateTime={created.toISOString()}>
                              {ago(created, locale, 'short')}
                            </time>
                          </span>
                        </span>
                        <span className="app-hm-end">
                          <AmountText
                            minorUnits={Number(tx.baseMinorUnits)}
                            currency={g.baseCurrency}
                            className="app-hm-amount"
                          />
                          {!transfer && me ? (
                            <span className="app-hm-dir">
                              <span className="sr-only">, </span>
                              {paidByMe
                                ? t('groups.recentPaid')
                                : myShare > 0
                                  ? t('groups.recentShare', {
                                      amount: formatCurrency(myShare, g.baseCurrency),
                                    })
                                  : null}
                            </span>
                          ) : null}
                        </span>
                      </AppLink>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </>
      ) : (
        <EmptyGroups
          onStart={(k) => {
            setTemplate(k);
            setOpen(true);
          }}
        />
      )}

      {dockAction}

      {/* Every payment that involves you: what you pay first (with "Pay"),
        then who pays you — opened from the summary figure or "Show all". */}
      <Sheet open={sheet === 'all'} onClose={() => setSheet(null)} title={t('groups.yourPayments')}>
        <div className="-mt-1 space-y-6">
          {toPay.length > 0 ? (
            <Section
              title={t('groups.toPay')}
              trailing={sectionTotal(toPay)}
              className="app-section-quiet"
            >
              <PayList rows={toPay} onPick={() => setSheet(null)} />
            </Section>
          ) : null}
          {incoming.length > 0 ? (
            <Section
              title={t('groups.incoming')}
              trailing={sectionTotal(incoming)}
              className="app-section-quiet"
            >
              <div className="-mx-[var(--app-gutter)]">
                <IncomingList rows={incoming} onPick={() => setSheet(null)} />
              </div>
            </Section>
          ) : null}
        </div>
      </Sheet>

      <Sheet open={picking} onClose={() => setPicking(false)} title={t('groups.pickGroup')}>
        <ul className="-mx-[var(--app-gutter)] -mt-1" data-testid="add-expense-pick">
          {addTargets.map((g) => (
            <li key={g.id}>
              <AppLink
                href={`/groups/${g.id}?add=1`}
                onClick={() => setPicking(false)}
                className="app-row flex min-h-14 w-full items-center gap-3 px-[var(--app-gutter)] py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600"
              >
                <GroupFaces groupId={g.id} members={g.members} myId={myId} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[1rem] font-semibold leading-6 tracking-[-0.015em]">
                    {g.name}
                  </span>
                  <span className="block text-[0.8125rem] leading-5 text-[var(--app-ink-2)]">
                    {plural('groups.row.members', g.members.filter((m) => m.isActive).length)}
                  </span>
                </span>
                <ChevronRight size={18} aria-hidden className="shrink-0 text-[var(--app-ink-3)]" />
              </AppLink>
            </li>
          ))}
        </ul>
      </Sheet>

      <Sheet open={open} onClose={() => setOpen(false)} title={t('group.create')}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            createGroup.mutate({ name, template, baseCurrency: currency });
          }}
        >
          <div>
            <Label htmlFor="g-name">{t('group.name')}</Label>
            <Input
              id="g-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              data-testid="group-name-input"
            />
          </div>
          <fieldset>
            <legend className="mb-1.5 block text-[0.8125rem] font-medium text-zinc-600 dark:text-zinc-300">
              {t('groups.kind')}
            </legend>
            <div className="flex gap-1.5">
              {TEMPLATES.map((k) => (
                <label key={k} className="app-kind">
                  <input
                    type="radio"
                    name="g-template"
                    value={k}
                    checked={template === k}
                    onChange={() => setTemplate(k)}
                    className="sr-only"
                    aria-label={t(`group.template.${k.toLowerCase() as Lowercase<Template>}`)}
                  />
                  <GroupIcon template={k} size={20} />
                  {/* Painted: the kind's word stays off the page text while
                      the new group's own name is what you look for next. */}
                  <Painted text={t(`group.template.${k.toLowerCase() as Lowercase<Template>}`)} />
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <Label htmlFor="g-currency">{t('group.baseCurrency')}</Label>
            <Select
              id="g-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as (typeof COMMON_CURRENCIES)[number])}
            >
              {COMMON_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={createGroup.isPending}
            data-testid="create-group-submit"
          >
            {createGroup.isPending ? t('common.loading') : t('group.create')}
          </Button>
        </form>
      </Sheet>
    </div>
  );
}

type MoneyRow = {
  key: string;
  groupName: string;
  currency: string;
  amount: number;
  other: {
    id: string;
    initials: string;
    color: string;
    displayName: string;
    user?: Parameters<typeof visibleAvatar>[0];
  };
};

/** Per-currency sums, in first-seen order: never a sum across currencies. */
function sums(rows: MoneyRow[]) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.currency, (m.get(r.currency) ?? 0) + r.amount);
  return [...m];
}

/**
 * r64 — the hero is the net. When money moves both ways, the one large
 * figure is where you stand overall (owed minus owing, per currency, signed
 * so the direction never rests on colour), and under it the two sides sit
 * as equal halves of one ledger line, "You're owed" | "You owe". Nothing in
 * the hero names a single group: the list right below already does. When
 * money moves one way only, that side is the net, so it leads alone with
 * the faces it goes to. The whole block is one 44px+ button into the
 * payments sheet.
 */
function NetPosition({
  owe,
  owed,
  onOpen,
}: {
  owe: MoneyRow[];
  owed: MoneyRow[];
  onOpen: () => void;
}) {
  const { t, plural } = useI18n();
  const both = owe.length > 0 && owed.length > 0;
  if (both) {
    const net = new Map<string, number>();
    for (const [cur, v] of sums(owed)) net.set(cur, (net.get(cur) ?? 0) + v);
    for (const [cur, v] of sums(owe)) net.set(cur, (net.get(cur) ?? 0) - v);
    const nets = [...net];
    const up = nets.every(([, v]) => v >= 0);
    const down = nets.every(([, v]) => v <= 0);
    const even = nets.every(([, v]) => v === 0);
    /*
     * r80 — the ledger line: owed and owing as one bar split in proportion
     * (one currency only; sums across currencies are meaningless). It draws
     * the sentence the two figures under it say, so the balance of a whole
     * account reads before a single digit does.
     */
    const inSums = sums(owed);
    const outSums = sums(owe);
    const ledger =
      inSums.length === 1 && outSums.length === 1 && inSums[0]![0] === outSums[0]![0]
        ? ([inSums[0]![1], outSums[0]![1]] as const)
        : null;
    const label = even
      ? t('groups.netEven')
      : up
        ? t('groups.netOwed')
        : down
          ? t('groups.netOwe')
          : t('groups.net');
    return (
      <div className="app-hm-pos app-hm-pos-r63">
        <button
          type="button"
          className={`app-hm-one app-hm-net ${down && !even ? 'app-hm-one-owe' : up && !even ? 'app-hm-one-in' : ''}`}
          onClick={onOpen}
          aria-haspopup="dialog"
        >
          <span className="app-hm-one-label">
            {label}
            <ChevronRight size={18} strokeWidth={2} aria-hidden className="app-hm-one-chev" />
          </span>
          <span className="app-hm-one-figs">
            {nets.map(([cur, v]) => (
              <AmountText
                key={cur}
                minorUnits={v}
                currency={cur}
                signed
                display
                className="app-hm-one-figure"
              />
            ))}
          </span>
          {ledger ? (
            <span className="app-hm-ledger" aria-hidden>
              <span className="app-hm-ledger-in" style={{ flexGrow: ledger[0] }} />
              <span className="app-hm-ledger-out" style={{ flexGrow: ledger[1] }} />
            </span>
          ) : null}
          <span className="app-hm-split">
            {(
              [
                ['in', t('groups.owedToYou'), owed],
                ['out', t('groups.youOwe'), owe],
              ] as const
            ).map(([k, name, rows]) => (
              <span key={k} className={`app-hm-half app-hm-half-${k}`}>
                <span className="app-hm-half-label">
                  <span
                    className={`app-hm-glyph ${k === 'out' ? 'app-hm-glyph-owe' : ''}`}
                    aria-hidden
                  >
                    {k === 'out' ? (
                      <ArrowUpRight size={12} strokeWidth={2.4} />
                    ) : (
                      <ArrowDownLeft size={12} strokeWidth={2.4} />
                    )}
                  </span>
                  {name}
                </span>
                {sums(rows).map(([cur, v]) => (
                  <AmountText
                    key={cur}
                    minorUnits={v}
                    currency={cur}
                    className="app-hm-half-figure"
                  />
                ))}
              </span>
            ))}
          </span>
        </button>
      </div>
    );
  }
  const leadOwe = owe.length > 0;
  const lead = leadOwe ? owe : owed;
  const faces = [...new Map(lead.map((r) => [r.other.id, r.other])).values()].slice(0, 3);
  const single = lead.length === 1 ? lead[0] : undefined;
  return (
    <div className="app-hm-pos app-hm-pos-r63">
      <button
        type="button"
        className={`app-hm-one app-hm-lead ${leadOwe ? 'app-hm-one-owe' : 'app-hm-one-in'}`}
        onClick={onOpen}
        aria-haspopup="dialog"
      >
        <span className="app-hm-one-label">
          <span className={`app-hm-glyph ${leadOwe ? 'app-hm-glyph-owe' : ''}`} aria-hidden>
            {leadOwe ? (
              <ArrowUpRight size={12} strokeWidth={2.4} />
            ) : (
              <ArrowDownLeft size={12} strokeWidth={2.4} />
            )}
          </span>
          {leadOwe ? t('groups.youOwe') : t('groups.owedToYou')}
        </span>
        <span className="app-hm-one-figs">
          {sums(lead).map(([cur, v]) => (
            <AmountText
              key={cur}
              minorUnits={v}
              currency={cur}
              display
              className="app-hm-one-figure"
            />
          ))}
        </span>
        <span className="app-hm-one-who">
          <span className="app-hm-faces" aria-hidden>
            {faces.map((f) => (
              <MemberChip
                key={f.id}
                initials={f.initials}
                color={f.color}
                size="sm"
                imageUrl={visibleAvatar(f.user)}
              />
            ))}
          </span>
          <span className="min-w-0 truncate">
            {single ? single.other.displayName : plural('groups.payCount', lead.length)}
          </span>
          <ChevronRight size={18} strokeWidth={2} aria-hidden className="app-hm-one-chev" />
        </span>
      </button>
    </div>
  );
}

/**
 * Who pays you, across groups: the person, the group, the amount. Read, not
 * acted on (it is theirs to send), so plain rows with the figure in ink and
 * a "+" — the lg aside and the phone sheet share it.
 */
function IncomingList({
  rows,
  onPick,
}: {
  rows: {
    key: string;
    groupId: string;
    groupName: string;
    currency: string;
    amount: number;
    other: {
      initials: string;
      color: string;
      displayName: string;
      user?: Parameters<typeof visibleAvatar>[0];
    };
  }[];
  onPick?: () => void;
}) {
  const { t } = useI18n();
  return (
    <Panel as="ul" plain>
      {rows.map((p) => (
        <li key={p.key}>
          <AppLink href={`/groups/${p.groupId}`} onClick={onPick} className={rowClass}>
            <MemberChip
              initials={p.other.initials}
              color={p.other.color}
              name={p.other.displayName}
              imageUrl={visibleAvatar(p.other.user)}
            />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-1.5 text-[0.9375rem] font-semibold leading-snug tracking-[-0.01em] [overflow-wrap:anywhere]">
                {p.other.displayName}
                <ArrowRight size={14} aria-hidden className="shrink-0 text-[var(--app-ink-3)]" />
                {t('settle.you')}
              </span>
              <span className="block truncate text-[0.8125rem] leading-snug text-[var(--app-ink-2)] lg:text-[0.875rem]">
                {p.groupName}
              </span>
            </span>
            <AmountText
              minorUnits={p.amount}
              currency={p.currency}
              signed
              className="shrink-0 text-[1rem] font-semibold tracking-[-0.015em] text-[var(--app-ink)]"
            />
          </AppLink>
        </li>
      ))}
    </Panel>
  );
}

/**
 * What is yours to pay, across groups: the person, the figure in the owe
 * colour, you → them · group, and a quiet 44px "Pay" that opens the group.
 * The phone sheet behind the tally's pay side and the lg aside share it.
 */
function PayList({
  rows,
  onPick,
  testId,
  card = false,
}: {
  rows: {
    key: string;
    groupId: string;
    groupName: string;
    currency: string;
    amount: number;
    other: {
      initials: string;
      color: string;
      displayName: string;
      user?: Parameters<typeof visibleAvatar>[0];
    };
  }[];
  onPick?: () => void;
  testId?: string;
  /** Home's to-pay card: the figure leads the row and it ends in a quiet 44px "Pay" (r56). */
  card?: boolean;
}) {
  const { t, formatCurrency } = useI18n();
  return (
    <ul data-testid={testId} aria-label={t('groups.yourPayments')}>
      {rows.map((p) =>
        card ? (
          <li key={p.key}>
            <AppLink
              href={`/groups/${p.groupId}`}
              onClick={onPick}
              className="app-due-row app-due-link app-pay-row"
              aria-label={`${t('groups.pay')} ${p.other.displayName}, ${formatCurrency(p.amount, p.currency)}, ${p.groupName}`}
            >
              <MemberChip
                initials={p.other.initials}
                color={p.other.color}
                name={p.other.displayName}
                imageUrl={visibleAvatar(p.other.user)}
              />
              {/* The debt, said as what to do: the figure in the owe colour
                leads, whom and where under it, and the row ends in the
                card's quiet "Pay" (r56: the bar's "+" is the one ink fill). */}
              <span className="min-w-0 flex-1">
                <AmountText
                  minorUnits={-p.amount}
                  currency={p.currency}
                  colored
                  className="app-pay-figure"
                />
                <span className="app-pay-who">
                  <span className="shrink-0">{t('settle.you')}</span>
                  <ArrowRight size={13} aria-hidden className="shrink-0 text-[var(--app-ink-3)]" />
                  <span className="min-w-0 truncate">
                    <span className="font-semibold text-[var(--app-ink)]">
                      {p.other.displayName}
                    </span>
                    {' · '}
                    {p.groupName}
                  </span>
                </span>
              </span>
              <span className="app-pay-cta" aria-hidden>
                {t('groups.pay')}
              </span>
            </AppLink>
          </li>
        ) : (
          <li key={p.key}>
            <AppLink
              href={`/groups/${p.groupId}`}
              onClick={onPick}
              className="app-due-row app-due-link"
              aria-label={`${t('groups.pay')} ${p.other.displayName}, ${formatCurrency(p.amount, p.currency)}, ${p.groupName}`}
            >
              <MemberChip
                initials={p.other.initials}
                color={p.other.color}
                name={p.other.displayName}
                imageUrl={visibleAvatar(p.other.user)}
              />
              {/* Read like a group row: who over where, the figure at the right
            edge at list size, so the net above stays the one large number.
            "Pay ›" under the figure says what the row does. */}
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-x-1.5 text-[1rem] font-semibold leading-6 tracking-[-0.015em]">
                  <span className="shrink-0">{t('settle.you')}</span>
                  <ArrowRight size={14} aria-hidden className="shrink-0 text-[var(--app-ink-3)]" />
                  <span className="min-w-0 truncate">{p.other.displayName}</span>
                </span>
                <Painted
                  text={p.groupName}
                  className="block truncate text-[0.8125rem] leading-5 text-[var(--app-ink-2)]"
                />
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <AmountText
                  minorUnits={-p.amount}
                  currency={p.currency}
                  colored
                  className="app-due-figure"
                />
                <span className="app-due-go" aria-hidden>
                  {t('groups.pay')}
                  <ChevronRight size={14} strokeWidth={2} />
                </span>
              </span>
            </AppLink>
          </li>
        ),
      )}
    </ul>
  );
}

/**
 * No groups yet (r51): what a group is, then the five kinds as the way in —
 * each a 56px row that opens "New group" with that kind already picked, so
 * the first tap starts the thing instead of reading about it. Phones: the
 * rows sit in the lower, thumb half of the screen, above the bar's "+";
 * lg: the text on the left, the kinds as one panel on the right, so the
 * canvas holds the action, not empty ground. The invite note closes it.
 */
function EmptyGroups({ onStart }: { onStart: (k: Template) => void }) {
  const { t } = useI18n();
  return (
    <section className="app-empty-groups" data-testid="groups-empty">
      <div className="app-empty-groups-text">
        <h2 className="text-[1.25rem] font-semibold leading-7 tracking-[-0.025em] lg:text-[1.75rem] lg:leading-9">
          {t('groups.empty.title')}
        </h2>
        <p className="mt-2 max-w-[34rem] text-[0.9375rem] leading-[1.5] text-[var(--app-ink-2)] lg:text-[1.0625rem]">
          {t('groups.empty.body')}
        </p>
        <p className="app-empty-groups-invite app-empty-groups-invite-lg">
          {t('groups.empty.invite')}
        </p>
      </div>
      <div className="min-w-0">
        <h3 className="app-empty-groups-label">{t('groups.empty.start')}</h3>
        <ul className="app-empty-kinds">
          {TEMPLATES.map((k) => {
            const key = k.toLowerCase() as Lowercase<Template>;
            return (
              <li key={k}>
                <button
                  type="button"
                  className="app-empty-kind"
                  onClick={() => onStart(k)}
                  aria-label={t(`group.template.${key}`)}
                  aria-describedby={`empty-kind-${key}`}
                >
                  <span className="app-group-mark" data-kind={key} aria-hidden>
                    <GroupIcon template={k} size={20} strokeWidth={1.9} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <Painted text={t(`group.template.${key}`)} className="app-empty-kind-name" />
                    <Painted
                      text={t(`groups.empty.hint.${key}`)}
                      className="app-empty-kind-hint"
                      id={`empty-kind-${key}`}
                    />
                  </span>
                  <ChevronRight
                    size={18}
                    aria-hidden
                    className="shrink-0 text-[var(--app-ink-3)]"
                  />
                </button>
              </li>
            );
          })}
        </ul>
        <p className="app-empty-groups-invite app-empty-groups-invite-sm">
          {t('groups.empty.invite')}
        </p>
      </div>
    </section>
  );
}

/*
 * r77 — a group's mark is its people, not its kind: the faces of the first
 * two others in it (the landing's illustrated people, or their photos),
 * overlapped on a square plate. Every group looks like itself; the kind
 * squares stay for the empty state, where there are no people yet.
 */
function GroupFaces({
  groupId,
  members,
  myId,
}: {
  groupId: string;
  members: {
    id: string;
    initials: string;
    color: string;
    displayName: string;
    isActive: boolean;
    userId?: string | null;
    user?: Parameters<typeof visibleAvatar>[0];
  }[];
  myId?: string | null;
}) {
  const active = members.filter((m) => m.isActive);
  const others = active.filter((m) => !myId || m.userId !== myId);
  // Which two: a stable turn through the roster per group, so two groups
  // with the same join order do not wear the same pair of faces.
  const pool = others.length > 0 ? others : active;
  const turn = [...groupId].reduce((a, c) => a + c.charCodeAt(0), 0) % Math.max(pool.length, 1);
  const shown = [...pool.slice(turn), ...pool.slice(0, turn)].slice(0, 2);
  return (
    <span className="app-gfaces" data-n={shown.length} aria-hidden>
      {shown.map((m) => (
        <span key={m.id} className="app-gfaces-one">
          <MemberChip
            initials={m.initials}
            color={m.color}
            name={m.displayName}
            size="sm"
            imageUrl={visibleAvatar(m.user)}
          />
        </span>
      ))}
    </span>
  );
}

/** "2 days ago" / "před 2 dny": the coarsest unit that is at least one. */
function ago(d: Date, locale: string, style: 'long' | 'short' = 'long'): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style });
  const s = (d.getTime() - Date.now()) / 1000;
  const a = Math.abs(s);
  if (a < 60) return rtf.format(0, 'second');
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (a < 7 * 86400) return rtf.format(Math.round(s / 86400), 'day');
  if (a < 30 * 86400) return rtf.format(Math.round(s / (7 * 86400)), 'week');
  if (a < 365 * 86400) return rtf.format(Math.round(s / (30 * 86400)), 'month');
  return rtf.format(Math.round(s / (365 * 86400)), 'year');
}
