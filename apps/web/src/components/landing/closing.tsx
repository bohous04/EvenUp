import type { CSSProperties } from 'react';
import Link from 'next/link';
import {
  t,
  tMarketing,
  formatCurrency,
  TRIMMED_PRICE_FORMAT,
  type Locale,
  type MarketingKey,
} from '@evenup/i18n';
import { currencyForLocale } from '@evenup/api/billing/prices';
import { LEGAL_DOCUMENTS } from '@/components/legal-document';
import { localizedPath } from '@/lib/locale-path';
import './closing.css';

/** Four question/answer pairs. */
const FAQ: readonly (readonly [MarketingKey, MarketingKey])[] = [
  ['marketing.faq.q1', 'marketing.faq.a1'],
  ['marketing.faq.q2', 'marketing.faq.a2'],
  ['marketing.faq.q3', 'marketing.faq.a3'],
  ['marketing.faq.q4', 'marketing.faq.a4'],
];

/**
 * The end of the page: the FAQ, then the ask, then the footer.
 *
 * The FAQ comes first, for the visitor who still has a question. It is native
 * `<details>`: no JavaScript, keyboard and screen-reader support for free, and
 * every answer still sits in the server HTML, so a crawler reads all four.
 * Opening one is a user action, so the row growing is not counted as layout
 * shift; nothing about it animates height.
 *
 * The ask is the last thing on the page and sits directly on the footer, so
 * the frame that closes the page holds the headline, the one button and the
 * footer's edge together. It is deliberately not a second hero: no product
 * card, no shadowed panel. The headline's promise is proved by one ruled
 * ledger line underneath — the two payments, each stamped paid, then the
 * group settled — the same end state the hero's demo is heading for.
 */
export function Closing({ locale }: { locale: Locale }) {
  const tm = (key: MarketingKey) => tMarketing(locale, key);
  return (
    <>
      <section id="faq" className="lp-section lp-faq-section" aria-labelledby="lp-faq-title">
        <div className="lp-wrap lp-faq">
          <div className="lp-faq-head">
            <h2 id="lp-faq-title" className="lp-h2 lp-faq-title">
              {tm('marketing.faq.title')}
            </h2>
            <Link href={localizedPath('/contact', locale)} className="lp-link lp-faq-more">
              <span className="lp-faq-more-text">{tm('marketing.faq.more')}</span>
              <span className="lp-arrow" aria-hidden="true">
                →
              </span>
            </Link>
          </div>
          <div className="lp-faq-list">
            {FAQ.map(([question, answer], i) => (
              <details key={question} className="lp-faq-item" style={{ '--i': i } as CSSProperties}>
                <summary className="lp-faq-q">
                  <h3 className="lp-h3">{tm(question)}</h3>
                  <span className="lp-faq-icon" aria-hidden="true" />
                </summary>
                <p className="lp-body lp-faq-a">{tm(answer)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section lp-ask" data-gauntlet="closing" aria-labelledby="lp-ask-title">
        <div className="lp-wrap">
          <div className="lp-cta">
            <h2 id="lp-ask-title" className="lp-display lp-cta-title">
              {tm('marketing.cta.title')}
            </h2>
            <div className="lp-cta-side">
              <p className="lp-lede lp-cta-body">{tm('marketing.cta.body')}</p>
              <div className="lp-cta-action">
                <Link
                  href={localizedPath('/sign-up', locale)}
                  data-testid="landing-cta-signup"
                  className="lp-btn lp-btn-primary lp-cta-btn"
                >
                  {tm('marketing.cta.button')}
                  <span className="lp-arrow" aria-hidden="true">
                    →
                  </span>
                </Link>
                <p className="lp-small lp-cta-note">{tm('marketing.cta.note')}</p>
              </div>
            </div>
          </div>
          <SettledLedger locale={locale} />
        </div>
      </section>
    </>
  );
}

/** The two payments the headline promises, in the locale's currency. */
const PAYMENTS = [
  { from: 'Honza', to: 'Jirka', minor: { CZK: 64000, EUR: 2600 } },
  { from: 'Petr', to: 'Jirka', minor: { CZK: 41000, EUR: 1700 } },
] as const;

/**
 * The headline's promise as one ruled ledger line: both suggested payments,
 * each stamped paid, then the group settled. Built from the app catalog
 * strings, so it says exactly what the product says, and set as figures —
 * the amounts are the loudest thing in the line, the way a money product
 * shows money.
 *
 * The settled cell carries the group's outstanding balance. Its base style is
 * the finished state (zero); on scroll-in it starts at the sum of both
 * payments and rolls down once per stamp — 43 → 17 → 0 — so the line counts
 * itself off. The intermediate figures are decoration (aria-hidden, opacity 0
 * at rest); the text a screen reader gets is "Everyone is settled up".
 */
function SettledLedger({ locale }: { locale: Locale }) {
  const currency = currencyForLocale(locale);
  const money = (minor: number) => formatCurrency(minor, currency, locale, TRIMMED_PRICE_FORMAT);
  const [first, second] = PAYMENTS;
  const total = first.minor[currency] + second.minor[currency];
  return (
    <figure className="lp-ledger" aria-label={tMarketing(locale, 'marketing.cta.cardLabel')}>
      <figcaption className="lp-ledger-cap">
        <span className="lp-ledger-group">{tMarketing(locale, 'marketing.cta.group')}</span>
        <span>{t(locale, 'balance.suggestedPayments')}</span>
      </figcaption>
      <ul className="lp-ledger-rows">
        {PAYMENTS.map((p, i) => (
          <li key={p.from} className="lp-ledger-cell" style={{ '--i': i } as CSSProperties}>
            <span className="lp-ledger-line">
              <span className="lp-ledger-who">
                {p.from}{' '}
                <span className="lp-ledger-to" aria-hidden="true">
                  →
                </span>
                <span className="lp-sr">,</span> {p.to}
              </span>
              <span className="lp-ledger-paid">
                <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                  <path d="M2.5 6.3 5 8.6 9.6 3.6" />
                </svg>
                {t(locale, 'balance.breakdown.paid')}
              </span>
            </span>
            <span className="lp-ledger-amount lp-num">{money(p.minor[currency])}</span>
          </li>
        ))}
        <li className="lp-ledger-cell lp-ledger-done">
          <span className="lp-ledger-line">
            <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
              <circle cx="10" cy="10" r="9" />
              <path d="M6 10.4 8.7 13 14.2 7.2" />
            </svg>
            {t(locale, 'balance.settledUp')}
          </span>
          <span className="lp-ledger-amount lp-ledger-bal lp-num" aria-hidden="true">
            <span className="lp-bal lp-bal-a">{money(total)}</span>
            <span className="lp-bal lp-bal-b">{money(second.minor[currency])}</span>
            <span className="lp-bal lp-bal-c">{money(0)}</span>
          </span>
        </li>
      </ul>
    </figure>
  );
}

/**
 * The marketing footer. Rendered by `(marketing)/layout.tsx`, so every public
 * page — the legal documents included — wears it: a consumer has to be able to
 * find the terms and the privacy policy without being signed in.
 *
 * It is the one dark surface on the page: the light page ends in a rounded
 * edge over it, the way a sheet of paper ends. Neutral ink, not a brand colour.
 */
export function MarketingFooter({ locale }: { locale: Locale }) {
  const tm = (key: MarketingKey) => tMarketing(locale, key);
  const path = (to: string) => localizedPath(to, locale);
  const anchor = (id: string) => `${path('/')}#${id}`;
  return (
    <footer className="lp-footer" data-gauntlet-chrome>
      <div className="lp-wrap lp-footer-grid">
        <div className="lp-footer-brand">
          {/* A sign-off, not a second home link: the header wordmark is the
              one link named after the product. */}
          <p className="lp-footer-mark">{t(locale, 'app.name')}</p>
          <p className="lp-footer-tagline">{tm('marketing.footer.tagline')}</p>
        </div>
        <nav className="lp-footer-col" aria-labelledby="lp-footer-product">
          <p id="lp-footer-product" className="lp-footer-label">
            {tm('marketing.footer.product')}
          </p>
          <ul className="lp-footer-links">
            <li>
              <Link href={anchor('features')}>{tm('marketing.nav.features')}</Link>
            </li>
            <li>
              <Link href={anchor('pricing')}>{tm('marketing.nav.pricing')}</Link>
            </li>
            <li>
              <Link href={anchor('faq')}>{tm('marketing.nav.faq')}</Link>
            </li>
            {SOURCE_URL ? (
              <li>
                <a href={SOURCE_URL}>{tm('marketing.footer.source')}</a>
              </li>
            ) : null}
          </ul>
        </nav>
        <nav className="lp-footer-col" aria-labelledby="lp-footer-legal">
          <p id="lp-footer-legal" className="lp-footer-label">
            {tm('legal.nav.title')}
          </p>
          <ul className="lp-footer-links">
            {LEGAL_DOCUMENTS.map((doc) => (
              <li key={doc.slug}>
                <Link href={path(`/${doc.slug}`)}>{tm(doc.label)}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="lp-wrap lp-footer-base">
        <p>
          © {new Date().getFullYear()} {t(locale, 'app.name')}
        </p>
      </div>
    </footer>
  );
}

/**
 * Where "view the source" points. Left unset by default rather than shipping a
 * placeholder repository URL that 404s; set `NEXT_PUBLIC_SOURCE_URL` at build
 * time and the footer link appears.
 */
const SOURCE_URL = process.env.NEXT_PUBLIC_SOURCE_URL;
