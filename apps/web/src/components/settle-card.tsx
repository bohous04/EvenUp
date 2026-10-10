'use client';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Button, Panel, Section, rowClass } from '@/components/ui';
import { AmountText } from '@/components/amount-text';
import { MemberChip } from '@/components/member-chip';
import { QrCode } from '@/components/qr-code';
import { Sheet } from '@/components/sheet';
import { ArrowRight, BellRing, Check, ChevronRight, Copy, Landmark } from '@/components/icons';
import { clampSpaydMessage } from '@/lib/spayd-message';

interface MemberLite {
  id: string;
  displayName: string;
  initials: string;
  color: string;
  imageUrl?: string | null;
}

/**
 * Where you stand in the group, and how it gets settled — one card.
 *
 * When you are on the roster, the lead card is your position: the direction
 * ("You're owed" / "You owe"), the figure, and under it the payments that make
 * that figure up — each row one person and the amount, tapping opens the settle
 * sheet. The figure and its rows are the same money (minimised payments sum to
 * your net balance), so the card answers "how much, and from whom" at once.
 * Payments that do not involve you follow as a quiet plain list.
 *
 * Without a roster seat (an admin viewing someone else's group) it falls back
 * to the single "Suggested payments" card.
 */
export function SettleCard({
  groupId,
  members,
  baseCurrency,
  groupName,
  myMemberId,
  aside,
}: {
  groupId: string;
  members: MemberLite[];
  baseCurrency: string;
  groupName: string;
  /** Your own member id, when you are on the roster: your payments lead. */
  myMemberId?: string;
  /** Sits right under your position card, before the payments between others
      (the group screen's next-round insight). */
  aside?: React.ReactNode;
}) {
  const { t, formatCurrency } = useI18n();
  const balances = trpc.balance.get.useQuery({ groupId });
  const [reminded, setReminded] = useState(false);
  const byId = new Map(members.map((m) => [m.id, m]));

  if (!balances.data) {
    // Reserve the card while the balance loads, so nothing below it jumps.
    return myMemberId ? (
      <section className="app-gd-pos app-gd-pos-loading" aria-hidden>
        <span className="app-gd-skel app-gd-skel-label" />
        <span className="app-gd-skel app-gd-skel-figure" />
      </section>
    ) : null;
  }
  const payments = balances.data.payments;
  const myBalanceAll =
    myMemberId !== undefined
      ? (balances.data.balances.find((b) => b.memberId === myMemberId)?.balanceMinorUnits ?? 0)
      : 0;
  const rowProps = { groupId, baseCurrency, groupName, myMemberId };
  const keyOf = (p: (typeof payments)[number], i: number) =>
    `${p.fromMemberId}-${p.toMemberId}-${i}`;

  if (!myMemberId) {
    return (
      <>
        <Section lead title={t('balance.suggestedPayments')}>
          {payments.length === 0 ? (
            <p className="app-gd-square-line" data-testid="settled-up">
              {t('balance.settledUp')}
            </p>
          ) : (
            <Panel as="ul" data-testid="payments-list">
              {payments.map((p, i) => (
                <SettleRow
                  key={keyOf(p, i)}
                  {...rowProps}
                  from={byId.get(p.fromMemberId)}
                  to={byId.get(p.toMemberId)}
                  amount={p.amountMinorUnits}
                />
              ))}
            </Panel>
          )}
        </Section>
        {aside}
      </>
    );
  }

  const mine = payments
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.fromMemberId === myMemberId || p.toMemberId === myMemberId);
  const others = payments
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.fromMemberId !== myMemberId && p.toMemberId !== myMemberId);
  const myBalance = myBalanceAll;
  const label = myBalance > 0 ? t('groups.owedToYou') : myBalance < 0 ? t('groups.youOwe') : null;

  /*
   * Owed money has one next step the rows can't take: asking for it. The
   * reminder is a plain message (who pays whom, how much, the group's link)
   * handed to the phone's share sheet — or copied where there is none.
   */
  const owedToMe = mine.filter(({ p }) => p.toMemberId === myMemberId);
  const remind = async () => {
    const nb = (n: number) => formatCurrency(n, baseCurrency).replace(/ /g, '\u00a0');
    const lines = owedToMe
      .map(({ p }) => {
        const from = byId.get(p.fromMemberId)?.displayName ?? '';
        const to = byId.get(p.toMemberId)?.displayName ?? '';
        return `${from} → ${to}: ${nb(p.amountMinorUnits)}`;
      })
      .join('\n');
    const text = t('settle.remindText', { group: groupName, lines, url: window.location.href });
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: groupName, text });
        return;
      } catch (e) {
        // Dismissed: nothing to do. Anything else falls through to the copy.
        if ((e as Error).name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setReminded(true);
      window.setTimeout(() => setReminded(false), 2400);
    } catch {
      // Clipboard blocked: no fallback that would not be a dead end.
    }
  };

  return (
    <>
      <section
        className="app-gd-pos"
        aria-live="polite"
        aria-label={label ?? t('group.yourPosition')}
        data-testid="my-position"
      >
        <div className="app-gd-pos-head">
          {label ? (
            <>
              <p className="app-gd-pos-label">
                <span
                  className={`app-key ${myBalance > 0 ? 'app-key-pos' : 'app-key-neg'}`}
                  aria-hidden
                />
                {label}
              </p>
              <p className="app-gd-pos-figure">
                <AmountText
                  minorUnits={Math.abs(myBalance)}
                  currency={baseCurrency}
                  display
                  paintedCents
                />
              </p>
            </>
          ) : (
            <p className="app-gd-pos-square">
              <span className="app-gd-pos-check" aria-hidden>
                <Check size={18} strokeWidth={2.25} />
              </span>
              <span>
                <span className="block">{t('group.youAreSquare')}</span>
                {payments.length === 0 ? (
                  <span className="app-gd-pos-sub" data-testid="settled-up">
                    {t('settle.allSquare')}
                  </span>
                ) : null}
              </span>
            </p>
          )}
        </div>
        {mine.length > 0 ? (
          <ul className="app-gd-pay" data-testid="payments-list">
            {mine.map(({ p, i }) => (
              <SettleRow
                key={keyOf(p, i)}
                {...rowProps}
                from={byId.get(p.fromMemberId)}
                to={byId.get(p.toMemberId)}
                amount={p.amountMinorUnits}
              />
            ))}
          </ul>
        ) : null}
        {myBalance > 0 && owedToMe.length > 0 ? (
          <button
            type="button"
            className="app-gd-remind"
            onClick={() => void remind()}
            data-testid="remind-btn"
          >
            {reminded ? (
              <Check size={18} strokeWidth={2} aria-hidden />
            ) : (
              <BellRing size={18} strokeWidth={1.9} aria-hidden />
            )}
            <span aria-live="polite">
              {reminded
                ? t('settle.remindCopied')
                : owedToMe.length > 1
                  ? t('settle.remindAll')
                  : t('settle.remind')}
            </span>
          </button>
        ) : null}
      </section>

      {aside}

      {others.length > 0 ? (
        <Section
          title={t('settle.betweenOthers')}
          className="app-gd-others"
          trailing={<span className="app-section-meta">{others.length}</span>}
        >
          <Panel as="ul" {...(mine.length === 0 ? { 'data-testid': 'payments-list' } : {})}>
            {others.map(({ p, i }) => (
              <SettleRow
                key={keyOf(p, i)}
                {...rowProps}
                from={byId.get(p.fromMemberId)}
                to={byId.get(p.toMemberId)}
                amount={p.amountMinorUnits}
              />
            ))}
          </Panel>
        </Section>
      ) : null}
    </>
  );
}

function SettleRow({
  groupId,
  baseCurrency,
  groupName,
  from,
  to,
  amount,
  myMemberId,
}: {
  groupId: string;
  baseCurrency: string;
  groupName: string;
  from?: MemberLite;
  to?: MemberLite;
  amount: number;
  myMemberId?: string;
}) {
  const { t, formatCurrency } = useI18n();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);

  const spayd = trpc.settlement.generateSpayd.useQuery(
    {
      groupId,
      toMemberId: to?.id ?? '',
      amountMinorUnits: amount,
      currency: baseCurrency,
      // The server rejects (not truncates) a message over 60 chars — clamp
      // here so a long group name can't make the query fail (see
      // spayd-message.ts for why sanitizeValue's own truncation is too late).
      message: clampSpaydMessage(t('settle.qrMessage', { group: groupName })),
    },
    { enabled: open && !!to, retry: false },
  );
  const recordTransfer = trpc.transaction.recordTransfer.useMutation({
    onSuccess: () => {
      setOpen(false);
      void utils.balance.get.invalidate({ groupId });
      void utils.balance.nextPayer.invalidate({ groupId });
      void utils.transaction.list.invalidate({ groupId });
      void utils.activity.list.invalidate({ groupId });
    },
  });

  if (!from || !to) return null;
  const youPay = myMemberId !== undefined && from.id === myMemberId;
  const youGet = myMemberId !== undefined && to.id === myMemberId;

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
      {/* The whole row is the tap target. A payment that involves you names
          only the other person (the card already says which way the money
          goes) with "pays you" / "you pay" under it; a payment between two
          others reads "Klára → Eva" with both faces. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="settle-btn"
        aria-label={
          youPay || youGet
            ? `${youPay ? t('groups.pay') : t('settle.receive')} ${(youPay ? to : from).displayName}, ${formatCurrency(amount, baseCurrency)}`
            : undefined
        }
        className={`${rowClass} app-gd-pay-row${youPay || youGet ? ' app-pay-row' : ''}`}
      >
        {youPay || youGet ? (
          (() => {
            const other = youPay ? to : from;
            return (
              <>
                <MemberChip
                  initials={other.initials}
                  color={other.color}
                  name={other.displayName}
                  imageUrl={other.imageUrl}
                />
                {/* Who, then what they do; the amount at the row's end in
                    ink. The card's head already says which way the money
                    goes and carries the one colour, so the rows read as its
                    breakdown, not as three competing totals. The whole row is
                    the action (chevron), no button per row. */}
                <span className="app-pay-text">
                  <span className="app-pay-name">{other.displayName}</span>
                  <span className="app-pay-dir">
                    {youPay ? t('settle.youPayThem') : t('settle.paysYou')}
                  </span>
                </span>
                <AmountText minorUnits={amount} currency={baseCurrency} className="app-pay-amt" />
              </>
            );
          })()
        ) : (
          <>
            {/* The pair: who pays, with who receives tucked into the corner. */}
            <span className="relative flex shrink-0 pb-1 pr-1">
              <MemberChip
                initials={from.initials}
                color={from.color}
                name={from.displayName}
                imageUrl={from.imageUrl}
              />
              <span className="absolute -bottom-0.5 -right-1 flex rounded-full ring-2 ring-[var(--app-stack-ring,var(--app-raised))]">
                <MemberChip
                  initials={to.initials}
                  color={to.color}
                  name={to.displayName}
                  imageUrl={to.imageUrl}
                  size="xs"
                />
              </span>
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[0.9375rem] font-medium tracking-[-0.01em]">
              <span className="min-w-0 truncate">{from.displayName}</span>
              <ArrowRight size={14} aria-hidden className="shrink-0 text-[var(--app-ink-3)]" />
              <span className="min-w-0 truncate">{to.displayName}</span>
            </span>
            <AmountText
              minorUnits={amount}
              currency={baseCurrency}
              className="shrink-0 text-[0.9375rem] font-medium text-[var(--app-ink-2)]"
            />
          </>
        )}
        <ChevronRight size={18} aria-hidden className="-mr-1 shrink-0 text-[var(--app-ink-3)]" />
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('settle.title')}
        testId="settle-sheet"
        footer={
          // Both ways of closing the debt, pinned under the thumb: the bank
          // payment (what the QR and the details above are for) leads, cash
          // is the quieter second line. Each label says what it records.
          <div className="flex flex-col gap-1.5">
            <Button
              className="min-h-12 w-full text-base"
              disabled={recordTransfer.isPending}
              onClick={() => record('QR')}
              data-testid="mark-paid"
            >
              {t('settle.markPaid')}
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              disabled={recordTransfer.isPending}
              onClick={() => record('CASH')}
              data-testid="mark-cash"
            >
              {t('settle.paidCash')}
            </Button>
          </div>
        }
      >
        <SettleSheetBody
          from={from}
          to={to}
          amount={amount}
          baseCurrency={baseCurrency}
          myMemberId={myMemberId}
          spayd={spayd.data?.spayd}
          state={spayd.data ? 'ready' : spayd.isError ? 'error' : 'loading'}
        />
      </Sheet>
    </li>
  );
}

/**
 * The QR Platba string's fields (SPD*1.0*ACC:…*AM:…*MSG:…), read back for
 * display only: the account as an IBAN in groups of four, the message.
 */
function readSpayd(spayd: string) {
  const fields = new Map<string, string>();
  for (const part of spayd.split('*').slice(2)) {
    const at = part.indexOf(':');
    if (at > 0) fields.set(part.slice(0, at), part.slice(at + 1));
  }
  const iban = (fields.get('ACC') ?? '').split('+')[0] ?? '';
  return {
    iban: iban.replace(/(.{4})(?=.)/g, '$1 '),
    ibanRaw: iban,
    message: fields.get('MSG') ?? '',
  };
}

/**
 * The settle sheet, top to bottom as you'd use it on a phone:
 *
 *  1. How much — the figure, left-aligned like every sheet's figure.
 *  2. Who to whom — a two-stop route (payer, then recipient), so the
 *     direction never depends on reading an arrow.
 *  3. How to pay by bank. On a phone you can't scan your own screen, so the
 *     QR is only half the answer: the account, amount and message sit under
 *     it as rows you copy straight into the bank app. The QR stays for the
 *     other half — showing it to the person paying you, or paying from a
 *     computer.
 *
 * The record buttons live in the sheet's pinned footer.
 */
function SettleSheetBody({
  from,
  to,
  amount,
  baseCurrency,
  myMemberId,
  spayd,
  state,
}: {
  from: MemberLite;
  to: MemberLite;
  amount: number;
  baseCurrency: string;
  myMemberId?: string;
  spayd?: string;
  state: 'ready' | 'error' | 'loading';
}) {
  const { t, locale } = useI18n();
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(null), 1800);
    } catch {
      // Clipboard blocked: the value is on screen to select by hand.
    }
  };

  const nameOf = (m: MemberLite) => (m.id === myMemberId ? t('settle.you') : m.displayName);
  const details = spayd ? readSpayd(spayd) : null;
  // What a bank app's amount field takes: digits and the locale's decimal mark.
  const amountPlain = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(amount / 100);

  const rows = details
    ? [
        {
          key: 'iban',
          label: t('settle.account'),
          shown: details.iban,
          value: details.ibanRaw,
          mono: true,
        },
        {
          key: 'amount',
          label: t('settle.amount'),
          shown: `${amountPlain} ${baseCurrency}`,
          value: amountPlain,
        },
        ...(details.message
          ? [
              {
                key: 'msg',
                label: t('settle.message'),
                shown: details.message,
                value: details.message,
              },
            ]
          : []),
        // The whole QR string — what a bank app pastes as "QR Platba".
        {
          key: 'spayd',
          label: t('settle.qrPayload'),
          shown: spayd!,
          value: spayd!,
          mono: true,
          small: true,
        },
      ]
    : [];

  // You paying: the copy rows lead (your phone can't scan itself) and the QR
  // follows for paying from another device. Being paid: the QR leads — it is
  // what you hold out to the payer.
  const youPay = myMemberId !== undefined && from.id === myMemberId;
  const youGet = myMemberId !== undefined && to.id === myMemberId;
  const rowList =
    rows.length > 0 ? (
      <ul className="app-st-rows">
        {rows.map((r) => (
          <li key={r.key} className="app-st-row">
            <span className="app-st-row-text">
              <span className="app-st-row-label">{r.label}</span>
              <span
                className={`app-st-row-value${r.mono ? ' app-st-mono' : ''}${r.small ? ' app-st-small' : ''}`}
              >
                {r.shown}
              </span>
            </span>
            <button
              type="button"
              className="app-st-copy"
              onClick={() => void copy(r.key, r.value)}
              aria-label={`${t('settle.copy')}: ${r.label}`}
            >
              {copied === r.key ? (
                <Check size={18} strokeWidth={2.25} aria-hidden />
              ) : (
                <Copy size={18} aria-hidden />
              )}
            </button>
          </li>
        ))}
      </ul>
    ) : null;

  return (
    <div className="app-st">
      <p className="app-st-figure">
        <AmountText minorUnits={amount} currency={baseCurrency} display />
      </p>

      <ol className="app-st-route" aria-label={t('settle.route')}>
        {[
          { m: from, role: t('settle.payer') },
          { m: to, role: t('settle.recipient') },
        ].map(({ m, role }) => (
          <li key={role} className="app-st-stop">
            <MemberChip
              initials={m.initials}
              color={m.color}
              name={m.displayName}
              imageUrl={m.imageUrl}
            />
            <span className="app-st-stop-text">
              <span className="app-st-stop-name">{nameOf(m)}</span>
              <span className="app-st-stop-role">{role}</span>
            </span>
          </li>
        ))}
      </ol>

      <section className="app-st-bank" aria-labelledby="app-st-bank-h">
        <h3 id="app-st-bank-h" className="app-st-h">
          {t('settle.qrCode')}
        </h3>
        {state === 'error' ? (
          <p className="app-st-note">
            <Landmark size={18} aria-hidden className="shrink-0" />
            <span>{t('settle.noIban')}</span>
          </p>
        ) : (
          <div className={`app-st-card${youPay ? ' app-st-card-rows-first' : ''}`}>
            {youPay ? (rowList ?? <div className="app-st-rows-hold" aria-hidden />) : null}
            {/* The plate is sized before the code arrives, so nothing moves
                when it does. */}
            <div className="app-st-qr" aria-busy={state === 'loading'}>
              {spayd ? <QrCode value={spayd} /> : null}
            </div>
            <p className="app-st-qr-hint">
              {state === 'loading'
                ? t('common.loading')
                : youPay
                  ? t('settle.qrHintScan')
                  : youGet
                    ? t('settle.qrHintShow')
                    : t('settle.qrHint')}
            </p>
            {youPay ? null : rowList}
            <span className="sr-only" aria-live="polite">
              {copied ? t('settle.copied') : ''}
            </span>
          </div>
        )}
      </section>
    </div>
  );
}
