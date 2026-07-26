// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VipPricing } from './vip-pricing';
import { Providers } from './providers';

// `globals: false` in vitest.config.ts means Testing Library's own auto
// cleanup never registers (see ocr-consent-dialog.test.tsx), so each render
// would otherwise pile up in `document.body` across the three cases below.
afterEach(cleanup);

const summary = {
  billingEnabled: true,
  creditBalance: 3,
  isVip: false,
  subscription: null,
  currency: 'CZK' as const,
  packs: [{ id: 'pack5', scans: 5, priceId: 'price_x' }],
};

function renderPricing(over: Partial<typeof summary> = {}) {
  render(
    <Providers>
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
    expect(screen.getByText(/3/)).toBeInTheDocument();
  });

  it('degrades gracefully when billing is disabled (self-hosting)', () => {
    renderPricing({ billingEnabled: false, packs: [] });
    expect(screen.queryByRole('button', { name: /subscribe|předplatit/i })).not.toBeInTheDocument();
  });
});
