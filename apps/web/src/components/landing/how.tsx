import {
  tMarketing,
  formatCurrency,
  TRIMMED_PRICE_FORMAT,
  type Locale,
  type MarketingKey,
} from '@evenup/i18n';
import { minimizeDebts } from '@evenup/core';
import { currencyForLocale } from '@evenup/api/billing/prices';
import type { ReactNode } from 'react';
import './how.css';

/**
 * "How it works": the claim, then its proof — shown in the product.
 *
 * Desktop: the claim at the top left, a hairline, the tally (2 → 1) and one
 * sentence; the right column is a recessed plate holding the EvenUp settle-up
 * screen for that group, the way Mercury stages its accounts panel. The
 * screen carries the whole proof as UI: the three balances (Petr nets to zero
 * and is marked settled), the two debts as they were, struck, and the one
 * payment that replaces them, with its "Mark paid" action. Phone: claim,
 * tally, screen.
 *
 * The payment row is not typed in: it is `minimizeDebts` run on the chain's
 * balances, so the page shows what the code produces.
 *
 * **Server-rendered, animated with CSS only.** No client component, no
 * hydration. Every animated element's *base* style is its final frame; the
 * sequence is one-shot, fired by a CSS scroll trigger, entirely inside
 * `prefers-reduced-motion: no-preference` + `@supports`. Amounts go through
 * `formatCurrency` in the locale currency (CZK / EUR).
 */
export function How({ locale }: { locale: Locale }) {
  const tm = (key: MarketingKey) => tMarketing(locale, key);
  const currency = currencyForLocale(locale);
  const money = (minor: number) => formatCurrency(minor, currency, locale, TRIMMED_PRICE_FORMAT);

  return (
    <section id="how" className="lp-section lp-how" data-gauntlet="how">
      <div className="lp-wrap">
        <div className="lp-how-grid lp-how-chain">
          <h2 className="lp-h2 lp-how-title lp-reveal">{tm('marketing.how.title')}</h2>
          <Tally
            from={2}
            to={CHAIN.length}
            unit={tm('marketing.demo.unit')}
            caption={tm('marketing.demo.names')}
          >
            <p className="lp-how-note">{tm('marketing.how.body')}</p>
          </Tally>
          <SettleScreen tm={tm} money={money} />
        </div>
      </div>
    </section>
  );
}

type Tm = (key: MarketingKey) => string;

/** The payoff of the proof as one figure: what you would have paid (dimmed) → what you pay. */
function Tally({
  from,
  to,
  unit,
  caption,
  children,
}: {
  from: number;
  to: number;
  unit: string;
  caption: string;
  children?: ReactNode;
}) {
  return (
    <div className="lp-how-tally">
      <p className="lp-d-cap">{caption}</p>
      <p className="lp-d-tally lp-num">
        <span className="lp-d-from">{from}</span>
        <span className="lp-d-arrow" aria-hidden="true">
          →
        </span>
        <span className="lp-d-to">{to}</span>
        <span className="lp-d-unit">{unit}</span>
      </p>
      {children}
    </div>
  );
}

/* --------------------------------------------------------------- screen */

const HUNDRED = 10000;
const BALANCES = [
  { memberId: 'Jirka', balanceMinorUnits: -HUNDRED },
  { memberId: 'Petr', balanceMinorUnits: 0 },
  { memberId: 'Honza', balanceMinorUnits: HUNDRED },
] as const;
/** The chain's net balances (−100 / 0 / +100) through the real algorithm. */
const CHAIN = minimizeDebts(BALANCES);
const PAYMENT = CHAIN[0]!;

const face = (name: string) => `/marketing/how/${name.toLowerCase()}.webp`;

function Avatar({ name, size }: { name: string; size: number }) {
  return (
    <img
      className="lp-hx-ava"
      src={face(name)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
    />
  );
}

function SettleScreen({ tm, money }: { tm: Tm; money: (minor: number) => string }) {
  const max = HUNDRED;
  return (
    <figure className="lp-how-panel" data-testid="settle-demo">
      <div className="lp-hx">
        <header className="lp-hx-head">
          <p className="lp-hx-group">{tm('marketing.how.app.group')}</p>
          <p className="lp-hx-names">{tm('marketing.demo.names')}</p>
        </header>

        {/* Balances: who is up, who is down, who is square. */}
        <div className="lp-hx-block">
          <p className="lp-hx-label">{tm('marketing.how.app.balances')}</p>
          <ul className="lp-hx-list">
            {BALANCES.map((b) => {
              const zero = b.balanceMinorUnits === 0;
              const share = Math.abs(b.balanceMinorUnits) / max;
              const sign = b.balanceMinorUnits < 0 ? '−' : b.balanceMinorUnits > 0 ? '+' : '';
              return (
                <li
                  key={b.memberId}
                  className={zero ? 'lp-hx-bal lp-hx-bal-zero' : 'lp-hx-bal'}
                  data-dir={
                    b.balanceMinorUnits < 0 ? 'neg' : b.balanceMinorUnits > 0 ? 'pos' : 'zero'
                  }
                >
                  <span className="lp-hx-who">
                    <span className="lp-hx-face">
                      <Avatar name={b.memberId} size={32} />
                      {zero ? (
                        /* Square: the photo greys and the ring breaks to a
                           dashed one, the mark the group screen uses for a
                           member who owes nothing and is owed nothing. */
                        <svg className="lp-hx-ring" viewBox="0 0 40 40" aria-hidden="true">
                          <circle className="lp-hx-ring-was" cx="20" cy="20" r="17" />
                          <circle
                            className="lp-hx-ring-zero"
                            data-testid="demo-settled-mid"
                            cx="20"
                            cy="20"
                            r="19"
                          />
                        </svg>
                      ) : null}
                    </span>
                    <span className="lp-hx-name">{b.memberId}</span>
                    {zero ? (
                      <span className="lp-hx-settled">{tm('marketing.how.app.settled')}</span>
                    ) : null}
                  </span>
                  <span className="lp-hx-bar" aria-hidden="true">
                    <span className="lp-hx-fill" style={{ ['--s' as string]: share }} />
                  </span>
                  <span className="lp-hx-amt lp-num">
                    {sign}
                    {money(Math.abs(b.balanceMinorUnits))}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Payments: the two debts as they stood, struck, then the one
            payment netting them off leaves. */}
        <div className="lp-hx-block">
          <div className="lp-hx-payhead">
            <p className="lp-hx-label">{tm('marketing.how.app.payments')}</p>
            <p className="lp-hx-toggle">
              <span className="lp-hx-switch" aria-hidden="true">
                <span className="lp-hx-knob" />
              </span>
              <span className="lp-hx-net">{tm('marketing.demo.net')}</span>
            </p>
          </div>

          <p className="lp-hx-sub">{tm('marketing.demo.before')}</p>
          <ul className="lp-hx-list lp-hx-debts">
            {(['marketing.how.app.debt1', 'marketing.how.app.debt2'] as const).map((k, i) => (
              <li key={k} className={`lp-hx-debt lp-hx-debt-${i + 1}`}>
                <span className="lp-hx-dtext">{tm(k)}</span>
                <s className="lp-hx-damt lp-num">{money(HUNDRED)}</s>
              </li>
            ))}
          </ul>

          <p className="lp-hx-sub lp-hx-sub-after">{tm('marketing.demo.after')}</p>
          <div className="lp-hx-pay">
            <span className="lp-hx-pair" aria-hidden="true">
              <Avatar name={PAYMENT.fromMemberId} size={28} />
              <svg className="lp-hx-arrow" viewBox="0 0 24 12">
                <path className="lp-hx-arrow-line" d="M1 6 H21" pathLength={1} />
                <path className="lp-hx-arrow-head" d="M17 2 L22 6 L17 10" />
              </svg>
              <Avatar name={PAYMENT.toMemberId} size={28} />
            </span>
            <span className="lp-hx-ptext">{tm('marketing.how.app.result')}</span>
            <span className="lp-hx-pamt lp-num">{money(PAYMENT.amountMinorUnits)}</span>
            <span className="lp-hx-cta">{tm('marketing.how.app.markPaid')}</span>
          </div>
        </div>
      </div>
    </figure>
  );
}
