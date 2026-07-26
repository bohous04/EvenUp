// @vitest-environment jsdom
//
// Regression coverage for two `user.me` states around the scan triggers:
//  - cold start: `user.me` may not have resolved yet when the user taps a
//    trigger. Treating that unknown state as "consent already granted" let
//    the action reach the server and come back FORBIDDEN instead of showing
//    the consent dialog, so a genuinely pending query disables the triggers.
//  - query error: `user.me` has no error handling and the default QueryClient
//    retries 3× before giving up, so an errored query must NOT be treated the
//    same as pending — otherwise the triggers stay disabled forever.
// `@/lib/trpc` is mocked (the first test to do so in apps/web) so `user.me`'s
// query state can be driven directly, without wiring a real tRPC client/query
// client.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_LOCALE } from '@evenup/i18n';
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
    <I18nProvider locale={DEFAULT_LOCALE}>
      <OcrScan groupId="g1" members={members} baseCurrency="CZK" />
    </I18nProvider>,
  );
}

describe('OcrScan cold start', () => {
  it('disables the scan triggers until user.me resolves, instead of assuming consent exists', async () => {
    useMeQuery.mockReturnValue({ data: undefined, isPending: true, isError: false });
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
    useMeQuery.mockReturnValue({
      data: { ocrConsentAt: null },
      isPending: false,
      isError: false,
    });
    renderScan();

    const uploadBtn = screen.getByTestId('ocr-upload-btn');
    expect(uploadBtn).not.toBeDisabled();

    await userEvent.click(uploadBtn);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

// Regression coverage: a previous fix gated the scan triggers on `!me.data`
// to guard the cold-start race above. But `user.me` has no error handling and
// the app's QueryClient retries 3× by default — if the query ultimately
// errors, `isPending` settles to false while `data` stays undefined forever,
// so `!me.data` is permanently true and the triggers are permanently
// disabled with no way to recover. That's worse than the race it replaced.
describe('OcrScan when user.me errors', () => {
  it('does not permanently disable the scan triggers, and lets the action proceed to the server gate', async () => {
    useMeQuery.mockReturnValue({ data: undefined, isPending: false, isError: true });
    renderScan();

    const uploadBtn = screen.getByTestId('ocr-upload-btn');
    expect(uploadBtn).not.toBeDisabled();
    expect(screen.getByTestId('ocr-gallery-btn')).not.toBeDisabled();
    expect(screen.getByTestId('ocr-add-pdf-btn')).not.toBeDisabled();

    // Without `me.data` we can't tell whether consent was already granted, so
    // `withConsent` must not show its own dialog — it falls through straight
    // to the action (here: opening the native file picker), leaving the
    // server's FORBIDDEN response as the real, still-legible gate.
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    await userEvent.click(uploadBtn);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });
});
