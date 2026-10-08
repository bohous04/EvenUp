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
 * The hero: the claim, one sentence of support, one action — and then the
 * claim happening, once, in the product's own terms.
 */
export function Hero({ locale }: { locale: Locale }) {
  const tm = (key: MarketingKey, values?: Record<string, string | number>) =>
    tMarketing(locale, key, values);
  const step = (i: number) => ({ '--i': i }) as React.CSSProperties;

  return (
    <section className="lp-hero" data-gauntlet="hero">
      <div className="lp-wrap">
        {/* One claim, set big and alone. Its payoff opens the paragraph in
            ink, so the eye takes the claim, then the payoff, then the
            argument: three steps down, nothing competing at headline size.
            Then the product on its own stage, the biggest thing on screen. */}
        <h1 className="lp-hero-title">
          <span className="lp-enter" style={step(0)}>
            {tm('marketing.hero.title')}
          </span>
        </h1>
        <div className="lp-hero-row">
          <p className="lp-lede lp-hero-lede lp-enter" style={step(1)}>
            <strong className="lp-hero-payoff">{tm('marketing.hero.titleAccent')}</strong>{' '}
            {tm('marketing.hero.subtitle')}
          </p>
          <div className="lp-hero-act lp-enter" style={step(2)}>
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

        {/* The stage is the place the trip happened: the Krkonoše ridge at
            dusk, Sněžka on the right, the group's screen set down on the
            snow below it. Generated for this page, not stock. Fixed
            width/height and an absolutely placed frame, so the photo never
            moves layout; phones get their own crop of the ridge. */}
        <div className="lp-hero-plate">
          <picture className="lp-hero-scene" aria-hidden="true">
            <source media="(max-width: 560px)" srcSet="/marketing/krkonose-m.webp" />
            <img
              src="/marketing/krkonose-1280.webp"
              srcSet="/marketing/krkonose-800.webp 800w, /marketing/krkonose-1280.webp 1280w"
              sizes="(min-width: 1280px) 1200px, 100vw"
              width={1280}
              height={720}
              alt=""
              fetchPriority="high"
              decoding="async"
            />
          </picture>
          <Collapse locale={locale} />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ settle-up */

type Who = 'ondra' | 'filip' | 'eva' | 'klara';

const PEOPLE: Record<Who, string> = {
  ondra: 'Ondra',
  filip: 'Filip',
  eva: 'Eva',
  klara: 'Klára',
};

/**
 * The trip, as four real expenses in minor units. Each is split equally among
 * the people listed after the payer. Run through the app, the balances come
 * out Ondra −2,310, Eva +2,310, Filip 0, Klára 0: one payment. Per expense —
 * the way other apps keep the books — the same four expenses leave 8 debts
 * worth 13,090 in total (3 + 3 + 1 + 1 debts; 6,930 + 2,310 + 3,080 + 770).
 */
const EXPENSES: { key: MarketingKey; payer: Who; minor: number; among: Who[] }[] = [
  {
    key: 'marketing.hero.panel.e1',
    payer: 'eva',
    minor: 924000,
    among: ['ondra', 'filip', 'eva', 'klara'],
  },
  {
    key: 'marketing.hero.panel.e2',
    payer: 'filip',
    minor: 308000,
    among: ['ondra', 'filip', 'eva', 'klara'],
  },
  { key: 'marketing.hero.panel.e3', payer: 'klara', minor: 616000, among: ['eva', 'klara'] },
  { key: 'marketing.hero.panel.e4', payer: 'ondra', minor: 154000, among: ['ondra', 'eva'] },
];
const NET_MINOR = 231000;
const NAIVE_COUNT = 8;
const NAIVE_MINOR = 1309000;

/** A member's photo. Fixed box, so it never moves anything as it loads. */
function Face({ who, size }: { who: Who; size: number }) {
  return (
    <img
      className="lp-hs-face"
      src={`/marketing/people/${who}.webp`}
      width={size}
      height={size}
      alt=""
      decoding="async"
    />
  );
}

/**
 * The hero's product visual: a group's settle-up screen. The expenses the trip
 * logged at the top, each with who paid and a share bar coloured by who it was
 * split between; underneath, what the app makes of them — one payment, Ondra
 * to Eva, while Filip and Klára owe nothing.
 *
 * On load it plays once, in the order the app works: the expenses land, their
 * shares fill, then the single payment draws from Ondra to Eva with its arrowhead
 * riding the tip of the line, and the per-expense tally is struck through
 * under the one netted payment. Every
 * element's resting style is the final frame; the motion only exists inside
 * `prefers-reduced-motion: no-preference` in hero.css. Text is never moved
 * across other text — it wipes up out of its own clip.
 */
function Collapse({ locale }: { locale: Locale }) {
  const tm = (key: MarketingKey, values?: Record<string, string | number>) =>
    tMarketing(locale, key, values);
  const czk = (minor: number) => formatCurrency(minor, 'CZK', locale, TRIMMED_PRICE_FORMAT);
  const amount = czk(NET_MINOR);
  const d = (ms: number) => ({ '--d': `${ms}ms` }) as React.CSSProperties;

  return (
    <figure
      className="lp-hero-stage lp-hs"
      role="img"
      aria-label={tm('marketing.hero.panel.aria', { amount })}
    >
      <div className="lp-hs-head" aria-hidden="true">
        <div>
          <span className="lp-hs-group">Krkonoše 2026</span>
          <span className="lp-hs-dates">{tm('marketing.hero.panel.dates')}</span>
        </div>
        <span className="lp-hs-stack">
          {(Object.keys(PEOPLE) as Who[]).map((who) => (
            <Face key={who} who={who} size={24} />
          ))}
        </span>
      </div>

      <div className="lp-hs-body" aria-hidden="true">
        <div className="lp-hs-exp">
          <p className="lp-hs-label">{tm('marketing.hero.panel.expenses')}</p>
          <ul className="lp-hs-list">
            {EXPENSES.map((e, i) => (
              <li key={e.key} className="lp-hs-row lp-hs-in" style={d(160 + i * 90)}>
                <Face who={e.payer} size={32} />
                <span className="lp-hs-what">
                  <span className="lp-hs-name">{tm(e.key)}</span>
                  <span className="lp-hs-meta">
                    {tm('marketing.hero.panel.paid', {
                      name: PEOPLE[e.payer],
                      count: e.among.length,
                    })}
                  </span>
                </span>
                <span className="lp-hs-sum">
                  <span className="lp-hs-amt lp-num">{czk(e.minor)}</span>
                  <span className="lp-hs-shares">
                    {e.among.map((who, j) => (
                      <span key={who} data-who={who} style={d(520 + i * 110 + j * 70)} />
                    ))}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="lp-hs-settle">
          <p className="lp-hs-label lp-hs-rule" style={d(1150)}>
            {tm('marketing.hero.panel.title')}
          </p>
          <div className="lp-hs-pay">
            <span className="lp-hs-end lp-hs-in" style={d(1250)}>
              <Face who="ondra" size={36} />
              <span>{PEOPLE.ondra}</span>
            </span>
            <span className="lp-hs-wire">
              <span className="lp-hs-wire-line" />
              <span className="lp-hs-wire-head" />
            </span>
            <span className="lp-hs-end lp-hs-in" style={d(1300)}>
              <Face who="eva" size={36} />
              <span>{PEOPLE.eva}</span>
            </span>
            <span className="lp-hs-payamt lp-num lp-hs-in" style={d(2250)}>
              {amount}
            </span>
          </div>
          <p className="lp-hs-nothing lp-hs-in" style={d(2500)}>
            <span className="lp-hs-pair">
              <Face who="filip" size={22} />
              <Face who="klara" size={22} />
            </span>
            <span>{tm('marketing.hero.panel.nothing')}</span>
            <span className="lp-hs-zero lp-num">{czk(0)}</span>
          </p>
        </div>
      </div>

      {/* The proof, kept on the screen at rest: the same four expenses
          settled one by one against what EvenUp asks for, side by side.
          One mark per payment, so 8 against 1 reads before any number is
          read; the per-expense figures are struck by a drawn rule that
          covers exactly their own text. */}
      <div className="lp-hs-foot" aria-hidden="true">
        <div className="lp-hs-tally lp-hs-naive">
          <span className="lp-hs-tally-k">{tm('marketing.hero.panel.naive')}</span>
          <span className="lp-hs-pips">
            {Array.from({ length: NAIVE_COUNT }, (_, i) => (
              <span key={i} style={d(500 + i * 60)} />
            ))}
          </span>
          <span className="lp-hs-figs lp-num">
            <span className="lp-hs-struck">
              {tm('marketing.hero.panel.naiveCount', { count: NAIVE_COUNT })}
            </span>
            <span className="lp-hs-struck">{czk(NAIVE_MINOR)}</span>
          </span>
        </div>
        <span className="lp-hs-to" />
        <div className="lp-hs-tally lp-hs-netted lp-hs-in" style={d(2050)}>
          <span className="lp-hs-tally-k">{tm('marketing.hero.panel.netted')}</span>
          <span className="lp-hs-pips">
            <span />
          </span>
          <span className="lp-hs-figs lp-num">
            <span>{tm('marketing.hero.panel.nettedCount')}</span>
            <span className="lp-hs-figsum">{amount}</span>
          </span>
        </div>
      </div>
    </figure>
  );
}
