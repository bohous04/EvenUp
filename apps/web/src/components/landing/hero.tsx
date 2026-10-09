import Link from 'next/link';
import {
  t,
  tMarketing,
  formatCurrency,
  TRIMMED_PRICE_FORMAT,
  type Locale,
  type MarketingKey,
} from '@evenup/i18n';
import { LandingCta } from '@/components/landing-cta';
import { MarketingLocaleSwitch } from '@/components/marketing-locale-switch';
import { localizedPath } from '@/lib/locale-path';
import { AvatarMark } from './avatar';
import { displayName } from './names';
import './hero.css';

/**
 * The marketing header. Rendered by `(marketing)/layout.tsx` — so the legal
 * pages wear it too — but it lives here, with the hero, because the two are
 * judged together: it is the first thing above the headline.
 *
 * Nav anchors carry the landing path (locale-resolved), so `#pricing` from
 * `/privacy` lands on the landing page's pricing rather than nowhere.
 */
export function MarketingHeader({ locale }: { locale: Locale }) {
  const tm = (key: MarketingKey) => tMarketing(locale, key);
  const path = (to: string) => localizedPath(to, locale);
  const anchor = (id: string) => `${path('/')}#${id}`;

  return (
    <header className="lp-header" data-gauntlet-chrome>
      <div className="lp-wrap lp-header-row">
        <Link href={path('/')} aria-label={t(locale, 'app.name')} className="lp-wordmark">
          {t(locale, 'app.name')}
        </Link>

        <nav className="lp-header-nav" aria-label={tm('marketing.nav.label')}>
          <Link href={anchor('features')}>{tm('marketing.nav.features')}</Link>
          <Link href={anchor('pricing')}>{tm('marketing.nav.pricing')}</Link>
          <Link href={anchor('faq')}>{tm('marketing.nav.faq')}</Link>
        </nav>

        <div className="lp-header-end">
          <MarketingLocaleSwitch locale={locale} label={t(locale, 'common.language')} />
          <LandingCta
            testId="landing-signin"
            href={path('/groups')}
            signedOutLabel={tm('marketing.hero.ctaSignIn')}
            signedInLabel={tm('marketing.hero.ctaApp')}
            className="lp-header-signin"
          />
          <Link href={path('/sign-up')} className="lp-header-start">
            {tm('marketing.hero.ctaPrimary')}
          </Link>
        </div>
      </div>
    </header>
  );
}

/**
 * The hero, read in three seconds: what it is for (the trip's costs), what it
 * spares you (nobody chasing anybody) and the proof, drawn — four friends'
 * tangle of debts collapsing into one payment. Text-led: the headline is the
 * LCP element; the picture is inline SVG, no image request.
 */
export function Hero({ locale }: { locale: Locale }) {
  const tm = (key: MarketingKey, values?: Record<string, string | number>) =>
    tMarketing(locale, key, values);
  const step = (i: number) => ({ '--i': i }) as React.CSSProperties;

  return (
    <section className="lp-hero" data-gauntlet="hero">
      <div className="lp-wrap lp-hero-grid">
        <div className="lp-hero-copy">
          <h1 className="lp-hero-title">
            <span className="lp-enter" style={step(0)}>
              {tm('marketing.hero.titleLead')}
            </span>{' '}
            <span className="lp-enter" style={step(1)}>
              {tm('marketing.hero.title')}
            </span>
          </h1>
          <p className="lp-lede lp-hero-lede lp-enter" style={step(2)}>
            <strong className="lp-hero-payoff">{tm('marketing.hero.titleAccent')}</strong>{' '}
            {tm('marketing.hero.subtitle')}
          </p>
          <div className="lp-hero-act lp-enter" style={step(3)}>
            <div className="lp-hero-actions">
              <Link
                href={localizedPath('/sign-up', locale)}
                data-testid="landing-signup"
                className="lp-btn lp-btn-primary"
              >
                {tm('marketing.hero.ctaPrimary')}
              </Link>
              <a href="#how" className="lp-link" data-testid="landing-how">
                {tm('marketing.hero.ctaSecondary')}
                <span className="lp-arrow" aria-hidden="true">
                  →
                </span>
              </a>
            </div>
            <p className="lp-hero-invited">
              {tm('marketing.hero.invited')}{' '}
              <LandingCta
                testId="landing-hero-app"
                href={localizedPath('/groups', locale)}
                signedOutLabel={tm('marketing.hero.invitedLink')}
                signedInLabel={tm('marketing.hero.ctaApp')}
                className="lp-hero-invited-link"
              />
            </p>
          </div>
        </div>

        <Tangle locale={locale} />
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- tangle */

type Who = 'ondra' | 'filip' | 'eva' | 'klara';
type Pt = { x: number; y: number };

/** The board, in viewBox units. Eva (who paid for the cabin) on the right,
 *  Ondra opposite her, so the one payment is the board's long axis. */
const W = 560;
const H = 420;
const R = 34;
const AT: Record<Who, Pt> = {
  ondra: { x: 96, y: 200 },
  filip: { x: 280, y: 78 },
  eva: { x: 464, y: 200 },
  klara: { x: 280, y: 322 },
};

/**
 * The trip, expense by expense — the way other apps keep the books. Four
 * expenses (cabin 9,240 paid by Eva for all four; groceries 3,080 by Filip for
 * all four; ski passes 6,160 by Klára for her and Eva; beer 1,540 by Ondra for
 * him and Eva) leave these 8 debts. Netted, they come to one: Ondra pays Eva
 * 2,310; Filip and Klára are square. `bow` bends each line off the straight,
 * so two debts between the same pair read as two.
 */
const DEBTS: { from: Who; to: Who; bow: number }[] = [
  { from: 'ondra', to: 'eva', bow: 56 },
  { from: 'filip', to: 'eva', bow: 24 },
  { from: 'klara', to: 'eva', bow: -24 },
  { from: 'ondra', to: 'filip', bow: 18 },
  { from: 'eva', to: 'filip', bow: 24 },
  { from: 'klara', to: 'filip', bow: -78 },
  { from: 'eva', to: 'klara', bow: -24 },
  { from: 'eva', to: 'ondra', bow: 56 },
];
const NET_MINOR = 231000;

const r1 = (v: number) => Math.round(v * 10) / 10;

/** A quadratic arc from a to b, bowed by `bow`, trimmed clear of both discs. */
function arc(a: Pt, b: Pt, bow: number, gap = R + 10) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const c = { x: (a.x + b.x) / 2 - (dy / len) * bow, y: (a.y + b.y) / 2 + (dx / len) * bow };
  const toward = (p: Pt, q: Pt) => {
    const l = Math.hypot(q.x - p.x, q.y - p.y);
    return { x: p.x + ((q.x - p.x) / l) * gap, y: p.y + ((q.y - p.y) / l) * gap };
  };
  const s = toward(a, c);
  const e = toward(b, c);
  return `M${r1(s.x)} ${r1(s.y)}Q${r1(c.x)} ${r1(c.y)} ${r1(e.x)} ${r1(e.y)}`;
}

const pct = (p: Pt) =>
  ({
    left: `${r1((p.x / W) * 100)}%`,
    top: `${r1(((p.y + R + 8) / H) * 100)}%`,
  }) as React.CSSProperties;

/**
 * The proof. On load it plays once, in the order the trip happened: the four
 * friends take their places, the eight debts draw in one by one, then fall
 * back to hairlines as the single payment draws from Ondra to Eva and the
 * tally strikes "8 payments". The resting style of every element is the last
 * frame — the still picture still says it: a faint tangle, one bold line.
 */
function Tangle({ locale }: { locale: Locale }) {
  const tm = (key: MarketingKey, values?: Record<string, string | number>) =>
    tMarketing(locale, key, values);
  const amount = formatCurrency(NET_MINOR, 'CZK', locale, TRIMMED_PRICE_FORMAT);
  const d = (ms: number) => ({ '--d': `${ms}ms` }) as React.CSSProperties;
  const who = Object.keys(AT) as Who[];

  return (
    <figure className="lp-ht" role="img" aria-label={tm('marketing.hero.panel.aria', { amount })}>
      <div className="lp-ht-head" aria-hidden="true">
        <span className="lp-ht-group">{locale === 'en' ? 'Alps 2026' : 'Krkonoše 2026'}</span>
        <span className="lp-ht-meta">{tm('marketing.hero.panel.dates')}</span>
        <span className="lp-ht-meta lp-ht-count">
          {tm('marketing.hero.panel.debts', { count: DEBTS.length })}
        </span>
      </div>

      <div className="lp-ht-board" aria-hidden="true">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} focusable="false">
          {DEBTS.map((e, i) => (
            <path
              key={`${e.from}-${e.to}`}
              className="lp-ht-debt"
              d={arc(AT[e.from], AT[e.to], e.bow)}
              pathLength={1}
              style={
                {
                  '--d': `${520 + i * 110}ms`,
                  '--dur': `${2350 - (520 + i * 110)}ms`,
                } as React.CSSProperties
              }
            />
          ))}
          <path
            className="lp-ht-pay"
            d={`M${AT.ondra.x + R + 12} ${AT.ondra.y}H${AT.eva.x - R - 16}`}
            pathLength={1}
          />
          <path
            className="lp-ht-tip"
            d={`M${AT.eva.x - R - 25} ${AT.eva.y - 9}L${AT.eva.x - R - 14} ${AT.eva.y}L${AT.eva.x - R - 25} ${AT.eva.y + 9}`}
          />
          {who.map((p, i) => (
            <g key={p} className="lp-ht-node" style={d(200 + i * 70)}>
              <AvatarMark name={p} cx={AT[p].x} cy={AT[p].y} r={R} />
            </g>
          ))}
        </svg>

        {who.map((p) => (
          <span key={p} className="lp-ht-name" style={pct(AT[p])}>
            {displayName(p, locale)}
            {(p === 'filip' || p === 'klara') && (
              <span className="lp-ht-square lp-ht-in" style={d(2700)}>
                {' · '}
                {tm('marketing.hero.panel.square')}
              </span>
            )}
          </span>
        ))}

        <span className="lp-ht-amount lp-num">
          <span className="lp-ht-in" style={d(2400)}>
            {amount}
          </span>
        </span>
      </div>

      <div className="lp-ht-foot" aria-hidden="true">
        <span className="lp-ht-tally">
          <span className="lp-ht-k">{tm('marketing.hero.panel.naive')}</span>
          <span className="lp-ht-struck lp-num">
            {tm('marketing.hero.panel.naiveCount', { count: DEBTS.length })}
          </span>
        </span>
        <span className="lp-ht-tally lp-ht-netted lp-ht-in" style={d(2400)}>
          <span className="lp-ht-to">→</span>
          <span className="lp-ht-k">{tm('marketing.hero.panel.netted')}</span>
          <span className="lp-num">{tm('marketing.hero.panel.nettedCount')}</span>
        </span>
      </div>
    </figure>
  );
}
