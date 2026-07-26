// @vitest-environment jsdom
//
// Regression coverage for the cold-start race: `user.me` may not have
// resolved yet when the user taps a scan trigger. Treating that unknown state
// as "consent already granted" let the action reach the server and come back
// FORBIDDEN instead of showing the consent dialog. `@/lib/trpc` is mocked (the
// first test to do so in apps/web) so `user.me`'s loading state can be driven
// directly, without wiring a real tRPC client/query client.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@/lib/i18n';
import { OcrScan } from './ocr-scan';

const {
  useMeQuery,
  useUtils,
  useSetOcrConsentMutation,
  useScanMutation,
  useCreateExpenseMutation,
} = vi.hoisted(() => ({
  useMeQuery: vi.fn(),
  useUtils: vi.fn(() => ({
    transaction: { list: { invalidate: vi.fn() } },
    balance: { get: { invalidate: vi.fn() }, nextPayer: { invalidate: vi.fn() } },
    stats: { byCategory: { invalidate: vi.fn() } },
    activity: { list: { invalidate: vi.fn() } },
    user: { me: { invalidate: vi.fn() } },
  })),
  useSetOcrConsentMutation: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    reset: vi.fn(),
  })),
  useScanMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useCreateExpenseMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils,
    user: {
      me: { useQuery: useMeQuery },
      setOcrConsent: { useMutation: useSetOcrConsentMutation },
    },
    ocr: { scan: { useMutation: useScanMutation } },
    transaction: { createExpense: { useMutation: useCreateExpenseMutation } },
  },
}));

// The consent dialog now renders on the shared `Modal` (native `<dialog>`),
// which jsdom doesn't fully implement.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});

afterEach(cleanup);

const members = [{ id: 'm1', displayName: 'Alice', initials: 'A', color: '#000000' }];

function renderScan() {
  return render(
    <I18nProvider>
      <OcrScan groupId="g1" members={members} baseCurrency="CZK" />
    </I18nProvider>,
  );
}

describe('OcrScan cold start', () => {
  it('disables the scan triggers until user.me resolves, instead of assuming consent exists', async () => {
    useMeQuery.mockReturnValue({ data: undefined, isLoading: true });
    renderScan();

    const uploadBtn = screen.getByTestId('ocr-upload-btn');
    expect(uploadBtn).toBeDisabled();
    expect(screen.getByTestId('ocr-gallery-btn')).toBeDisabled();
    expect(screen.getByTestId('ocr-add-pdf-btn')).toBeDisabled();

    // A disabled button can't be activated — nothing should open.
    await userEvent.click(uploadBtn);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('enables the triggers and prompts for consent once user.me resolves without prior consent', async () => {
    useMeQuery.mockReturnValue({ data: { ocrConsentAt: null }, isLoading: false });
    renderScan();

    const uploadBtn = screen.getByTestId('ocr-upload-btn');
    expect(uploadBtn).not.toBeDisabled();

    await userEvent.click(uploadBtn);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
