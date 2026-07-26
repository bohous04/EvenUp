// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createTranslator, DEFAULT_LOCALE } from '@evenup/i18n';
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

const summary = {
  billingEnabled: true,
  creditBalance: 3,
  isVip: false,
  subscription: null,
  currency: 'CZK' as const,
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
