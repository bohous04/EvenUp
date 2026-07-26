// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createTranslator, formatCurrency, DEFAULT_LOCALE } from '@evenup/i18n';
import {
  displayPackPriceMinor,
  displaySubscriptionPriceMinor,
} from '@evenup/api/billing/display-prices';
import { VipPricing } from './vip-pricing';
import { Providers } from './providers';

// `globals: false` in vitest.config.ts means Testing Library's own auto
// cleanup never registers (see ocr-consent-dialog.test.tsx), so each render
// would otherwise pile up in `document.body` across the three cases below.
afterEach(cleanup);

// `<Providers>` now requires an explicit locale — pass `@evenup/i18n`'s
// default and build expected strings the same way rather than hardcoding
// one locale's text.
const t = createTranslator(DEFAULT_LOCALE);

/**
 * `Intl` puts a non-breaking space between amount and currency symbol
 * ("50,00 Kč"); `toHaveTextContent` collapses whitespace in the *element* but
 * not in the expected string, so an un-normalized expectation fails on two
 * strings that render identically. Normalize both sides.
 */
const money = (minor: number, currency: 'CZK' | 'EUR') =>
  formatCurrency(minor, currency, DEFAULT_LOCALE, { trimZeroFraction: true }).replace(/\s+/g, ' ');

const summary = {
  billingEnabled: true,
  creditBalance: 3,
  isVip: false,
  // Typed loosely so cases below can hand back a `past_due` row — `status` is
  // a free-form Stripe status string on the wire, not a union.
  subscription: null as {
    status: string;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
  } | null,
  // "A VIP price is configured for this currency", separate from
  // `billingEnabled` ("STRIPE_SECRET_KEY is set") — see billing.summary.
  subscriptionAvailable: true,
  // Widened rather than `as const` so a case below can override it with EUR —
  // `billing.summary` resolves the currency from the caller's locale, and the
  // panel has to price in whichever one it gets back.
  currency: 'CZK' as 'CZK' | 'EUR',
  packs: [{ id: 'pack5', scans: 5, priceId: 'price_x' }],
};

// Mirrors production's `PACK_SIZES = [2, 5, 10]` (packages/api/src/billing/prices.ts)
// — a single-pack fixture never exercises the requirement that the withdrawal
// checkbox gates *every* Buy button, and `getByRole` collides once more than
// one "Buy"/"Koupit" button exists.
const multiPackSummary = {
  ...summary,
  packs: [
    { id: 'pack2', scans: 2, priceId: 'price_2' },
    { id: 'pack5', scans: 5, priceId: 'price_5' },
    { id: 'pack10', scans: 10, priceId: 'price_10' },
  ],
};

function renderPricing(over: Partial<typeof summary> = {}) {
  render(
    <Providers locale={DEFAULT_LOCALE}>
      <VipPricing
        summary={{ ...summary, ...over }}
        onSubscribe={() => {}}
        onBuy={() => {}}
        onPortal={() => {}}
      />
    </Providers>,
  );
}

describe('VipPricing', () => {
  it('keeps Buy disabled until the withdrawal right is acknowledged', async () => {
    renderPricing();
    const buy = screen.getByRole('button', { name: /buy|koupit/i });
    expect(buy).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox'));
    expect(buy).toBeEnabled();
  });

  it('shows the current credit balance', () => {
    renderPricing();
    expect(screen.getByText(t('vip.balance', { count: 3 }))).toBeInTheDocument();
  });

  it('degrades gracefully when billing is disabled (self-hosting)', () => {
    renderPricing({ billingEnabled: false, packs: [] });
    expect(screen.queryByRole('button', { name: /subscribe|předplatit/i })).not.toBeInTheDocument();
  });

  it('prices the subscription and every pack in the summary currency', () => {
    // The panel used to render pack rows with no price at all, which is what
    // `display-prices.ts` exists to fix. Amounts are never written into the
    // copy — they go through `formatCurrency`, so this builds the expected
    // strings the same way rather than hardcoding "50,00 Kč".
    render(
      <Providers locale={DEFAULT_LOCALE}>
        <VipPricing
          summary={multiPackSummary}
          onSubscribe={() => {}}
          onBuy={() => {}}
          onPortal={() => {}}
        />
      </Providers>,
    );

    expect(screen.getByTestId('vip-price')).toHaveTextContent(
      t('vip.price.month', { price: money(displaySubscriptionPriceMinor('CZK'), 'CZK') }).replace(
        /\s+/g,
        ' ',
      ),
    );
    for (const pack of multiPackSummary.packs) {
      expect(screen.getByTestId(`vip-price-${pack.id}`)).toHaveTextContent(
        money(displayPackPriceMinor('CZK', pack.scans)!, 'CZK'),
      );
    }
  });

  it('prices in EUR when the summary resolved to EUR', () => {
    renderPricing({ currency: 'EUR', packs: [{ id: 'pack2', scans: 2, priceId: 'p' }] });
    expect(screen.getByTestId('vip-price-pack2')).toHaveTextContent(
      money(displayPackPriceMinor('EUR', 2)!, 'EUR'),
    );
  });

  it('renders a pack with no display price rather than dropping or faking one', () => {
    // A pack size configured in Stripe but missing from `display-prices.ts`:
    // the row must still be purchasable, just without an amount.
    renderPricing({ packs: [{ id: 'pack7', scans: 7, priceId: 'price_7' }] });
    expect(screen.getByText(t('vip.credits.pack', { scans: 7 }))).toBeInTheDocument();
    expect(screen.queryByTestId('vip-price-pack7')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /buy|koupit/i })).toBeInTheDocument();
  });

  /**
   * The `past_due` regression: Stripe moves a subscription whose card expired
   * to `past_due`, `billing.summary` used to look for `'active'` alone, and
   * the panel therefore offered "Subscribe to VIP" to somebody who already had
   * a subscription — a second one, billed alongside the first the moment
   * Stripe's smart retries recovered it.
   */
  it.each(['past_due', 'unpaid', 'incomplete'])(
    'offers the portal and a payment-problem hint, never Subscribe, when the subscription is %s',
    (status) => {
      renderPricing({
        subscription: { status, currentPeriodEnd: new Date(), cancelAtPeriodEnd: false },
      });
      expect(screen.getByTestId('vip-manage')).toBeInTheDocument();
      expect(screen.getByTestId('vip-payment-problem')).toBeInTheDocument();
      expect(screen.queryByTestId('vip-subscribe')).not.toBeInTheDocument();
    },
  );

  it('offers the portal with no payment warning while the subscription is healthy', () => {
    renderPricing({
      subscription: { status: 'active', currentPeriodEnd: new Date(), cancelAtPeriodEnd: false },
    });
    expect(screen.getByTestId('vip-manage')).toBeInTheDocument();
    expect(screen.queryByTestId('vip-payment-problem')).not.toBeInTheDocument();
  });

  it('hides Subscribe when no VIP price is configured for this currency', () => {
    // `STRIPE_SECRET_KEY` set but `STRIPE_PRICE_EUR_VIP` missing: the button
    // used to render for every English user and every click came back
    // PRECONDITION_FAILED. Packs are configured separately, so they stay.
    renderPricing({ currency: 'EUR', subscriptionAvailable: false });
    expect(screen.queryByTestId('vip-subscribe')).not.toBeInTheDocument();
    expect(screen.getByTestId('vip-unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /buy|koupit/i })).toBeInTheDocument();
  });

  it('gates every Buy button behind the single withdrawal checkbox, for every configured pack', async () => {
    render(
      <Providers locale={DEFAULT_LOCALE}>
        <VipPricing
          summary={multiPackSummary}
          onSubscribe={() => {}}
          onBuy={() => {}}
          onPortal={() => {}}
        />
      </Providers>,
    );
    const buyButtons = screen.getAllByRole('button', { name: /buy|koupit/i });
    expect(buyButtons).toHaveLength(3);
    for (const button of buyButtons) expect(button).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox'));

    for (const button of buyButtons) expect(button).toBeEnabled();
  });
});
