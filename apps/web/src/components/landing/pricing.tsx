import type { CSSProperties } from 'react';
import Link from 'next/link';
import {
  tMarketing,
  formatCurrency,
  TRIMMED_PRICE_FORMAT,
  type Locale,
  type MarketingKey,
} from '@evenup/i18n';
import { currencyForLocale, TRIAL_PERIOD_DAYS } from '@evenup/api/billing/prices';
import {
  DISPLAY_PACK_SIZES,
  displayPackPriceMinor,
  displaySubscriptionPriceMinor,
} from '@evenup/api/billing/display-prices';
import { VIP_SCANS_PER_PERIOD } from '@evenup/api/billing/entitlement';
import { env } from '@/server/env';
import { localizedPath } from '@/lib/locale-path';
import './pricing.css';

/**
 * Pricing: three plans as columns of one table-like block, divided by
 * hairlines — not three floating cards. Read across, the prices form one row
 * of figures (Free · €2 · from €1); read down, each column explains itself.
 *
 * Prices come from `display-prices.ts` and render through the locale-aware
 * `formatCurrency`, so no amount and no currency symbol is ever written into
 * the copy. Czech pages are priced in CZK and English in EUR — the same
 * `currencyForLocale` rule checkout applies, so the number a visitor reads
 * here is the one they meet in Stripe. Nothing here touches Stripe, so the
 * page renders identically on a self-hosted instance with billing off.
 */
/** The slip's items, in the order they print. */
const RECEIPT_KEYS = [
  'marketing.pricing.scan.item1',
  'marketing.pricing.scan.item2',
  'marketing.pricing.scan.item3',
  'marketing.pricing.scan.item4',
  'marketing.pricing.scan.item5',
] as const satisfies readonly MarketingKey[];

/** Illustrative shelf prices in minor units, one set per page currency. */
const RECEIPT_MINOR = {
  CZK: [4290, 6990, 17400, 12900, 14900],
  EUR: [179, 289, 719, 529, 599],
} as const;

export function Pricing({ locale }: { locale: Locale }) {
  const tm = (key: MarketingKey, values?: Record<string, string | number>) =>
    tMarketing(locale, key, values);
  const currency = currencyForLocale(locale);
  // A price list advertises round numbers — "50 Kč", "€2" — so a whole amount
  // sheds its ",00". The VIP panel in the app formats the same figures the
  // same way; `TRIMMED_PRICE_FORMAT` is shared with it, so the two stay in
  // step by construction rather than by convention.
  const money = (minor: number) => formatCurrency(minor, currency, locale, TRIMMED_PRICE_FORMAT);
  const subscription = money(displaySubscriptionPriceMinor(currency));
  // An unpriced size drops out rather than showing a blank — or invented —
  // amount; the headline "from" figure is the cheapest pack that is priced.
  const packs = DISPLAY_PACK_SIZES.flatMap((scans) => {
    const minor = displayPackPriceMinor(currency, scans);
    return minor === undefined ? [] : [{ scans, minor }];
  });
  // The slip is a till print, so it keeps its decimals ("564,80 Kč").
  const receiptMoney = (minor: number) => formatCurrency(minor, currency, locale);
  const receiptItems = RECEIPT_MINOR[currency];
  const receiptTotal = receiptItems.reduce((sum, minor) => sum + minor, 0);
  const cheapestPack = packs.length ? Math.min(...packs.map((p) => p.minor)) : undefined;

  return (
    <section id="pricing" className="lp-section lp-pricing" data-gauntlet="pricing">
      {/* One flat grid, so the parts can be re-ordered per width without
          duplicating markup: on a desk the title, lede and actions stand left
          of the receipt with the price row beneath; on a phone the price row
          comes straight after the lede — the figures are what a visitor came
          for — and the receipt, the explanation of the unit, closes it. */}
      <div className="lp-wrap lp-pricing-wrap">
        <h2 className="lp-h2 lp-pricing-title">{tm('marketing.pricing.title')}</h2>
        <p className="lp-lede lp-pricing-lede">{tm('marketing.pricing.lede')}</p>
        <div className="lp-pricing-actions">
          <Link href={localizedPath('/sign-up', locale)} className="lp-btn lp-btn-primary">
            {tm('marketing.pricing.cta')}
          </Link>
          {/* The public route to checkout. `/vip` stays `noindex` (it is an
              account page); a signed-out visitor meets a sign-in prompt
              there rather than a dead end. */}
          <Link
            href={localizedPath('/vip', locale)}
            className="lp-btn lp-btn-quiet"
            data-testid="pricing-vip-cta"
          >
            {tm('marketing.pricing.ctaVip')}
          </Link>
        </div>

        {/* The unit every plan is priced in, shown rather than named: one
            till slip, drawn in HTML so it is crisp at any width and costs
            no image bytes. A scan line reads it top to bottom, each item
            registers as it passes, and the total is framed and labelled.
            Its box is fixed by its text, so nothing shifts as it plays. */}
        <figure className="lp-receipt" role="img" aria-label={tm('marketing.pricing.scan.alt')}>
          <div className="lp-receipt-plate" aria-hidden="true">
            {/* On a desk the slip prints out of a till slot in the plate's
                top edge, so its head running off the plate reads as paper
                still in the printer, not as a crop. */}
            <span className="lp-receipt-slot" />
            <div className="lp-receipt-paper">
              <span className="lp-receipt-sheet" />
              <p className="lp-receipt-shop">{tm('marketing.pricing.scan.shop')}</p>
              <p className="lp-receipt-when">{tm('marketing.pricing.scan.when')}</p>
              <ul className="lp-receipt-items">
                {receiptItems.map((minor, i) => (
                  <li key={i} className="lp-receipt-item" style={{ '--i': i } as CSSProperties}>
                    <span>{tm(RECEIPT_KEYS[i]!)}</span>
                    <span className="lp-num">{receiptMoney(minor)}</span>
                  </li>
                ))}
              </ul>
              <div className="lp-receipt-sum">
                <span>{tm('marketing.pricing.scan.total')}</span>
                <span className="lp-num">{receiptMoney(receiptTotal)}</span>
                <span className="lp-receipt-total" />
                <span className="lp-receipt-caption">{tm('marketing.pricing.scan.caption')}</span>
              </div>
              <p className="lp-receipt-thanks">{tm('marketing.pricing.scan.thanks')}</p>
              <span className="lp-receipt-scan">
                <span className="lp-receipt-beam" />
              </span>
            </div>
          </div>
        </figure>

        {/* One row of figures, hairlines between — read across like a stat
            row. Each plan is a subgrid, so name, price, terms and detail line
            up across all three columns whatever the copy length. */}
        <div className="lp-plans" data-testid="pricing">
          <article className="lp-plan">
            <h3 className="lp-plan-name">{tm('marketing.pricing.free.title')}</h3>
            <p className="lp-plan-price">{tm('marketing.pricing.free.price')}</p>
            <p className="lp-plan-body">{tm('marketing.pricing.free.body')}</p>
            {/* What "free" covers, as the same ruled rows as the packs — so
                every column ends in a detail block and none trails off. */}
            <dl className="lp-plan-detail lp-rows">
              {(['groups', 'settle', 'ads'] as const).map((row) => (
                <div key={row} className="lp-row">
                  <dt>{tm(`marketing.pricing.free.${row}`)}</dt>
                  <dd>{tm(`marketing.pricing.free.${row}Value`)}</dd>
                </div>
              ))}
            </dl>
          </article>

          <article className="lp-plan lp-plan-vip">
            <h3 className="lp-plan-name">{tm('marketing.pricing.vip.title')}</h3>
            <p className="lp-plan-price lp-num" data-testid="pricing-vip">
              {subscription}{' '}
              <span className="lp-plan-unit">{tm('marketing.pricing.vip.period')}</span>
            </p>
            <p className="lp-plan-body">
              {/* Both numbers are product constants, not copy — the catalog
                  interpolates them so neither can drift from what the code does:
                  `VIP_SCANS_PER_PERIOD` is what actually gates a scan, and
                  `receiptRetentionDays` is what the cleanup job deletes on. */}
              {tm('marketing.pricing.vip.body', {
                scans: VIP_SCANS_PER_PERIOD,
                days: env.receiptRetentionDays,
              })}
            </p>
            <div className="lp-plan-detail">
              {/* The trial as a timeline: nothing today, the first payment on
                  day N. Decorative — the sentence below carries the same facts
                  for assistive tech. */}
              <div className="lp-trial" aria-hidden="true">
                <div className="lp-trial-track">
                  <span className="lp-trial-fill" />
                </div>
                <div className="lp-trial-stop">
                  <span className="lp-trial-amount lp-num">{money(0)}</span>
                  <span className="lp-trial-when">{tm('marketing.pricing.vip.today')}</span>
                </div>
                <div className="lp-trial-stop lp-trial-stop-end">
                  <span className="lp-trial-amount lp-num">{subscription}</span>
                  <span className="lp-trial-when">
                    {tm('marketing.pricing.vip.day', { trialDays: TRIAL_PERIOD_DAYS })}
                  </span>
                </div>
              </div>
              {/* The trial belongs on the public price list: it is the offer, and
                  a visitor deciding whether to register needs to know a card is
                  required up front. `TRIAL_PERIOD_DAYS` is what checkout sends
                  Stripe, so the advertised length cannot drift. */}
              <p className="lp-plan-trial" data-testid="pricing-vip-trial">
                {tm('marketing.pricing.vip.trial', { trialDays: TRIAL_PERIOD_DAYS })}
              </p>
            </div>
          </article>

          <article className="lp-plan">
            <h3 className="lp-plan-name">{tm('marketing.pricing.packs.title')}</h3>
            <p className="lp-plan-price lp-num">
              {cheapestPack !== undefined ? (
                <>
                  <span className="lp-plan-unit lp-plan-unit-pre">
                    {tm('marketing.pricing.packs.from')}
                  </span>{' '}
                  {money(cheapestPack)}
                </>
              ) : null}
            </p>
            <p className="lp-plan-body">{tm('marketing.pricing.packs.body')}</p>
            <dl className="lp-plan-detail lp-rows">
              {packs.map(({ scans, minor }) => (
                <div key={scans} className="lp-row">
                  <dt>{tm('marketing.pricing.packs.item', { scans })}</dt>
                  <dd className="lp-num" data-testid={`pricing-pack-${scans}`}>
                    {money(minor)}
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        </div>

        <p className="lp-small lp-pricing-note">{tm('marketing.pricing.note')}</p>
      </div>
    </section>
  );
}
