// @vitest-environment jsdom
//
// This is the first component-rendering test in apps/web (the rest of the
// suite is pure-logic `.test.ts` under `environment: 'node'`). The consent
// dialog is presentational — its DOM output *is* the behavior to verify — so
// it's tested with Testing Library rather than left uncovered. Scoped via the
// `@vitest-environment` pragma (not the shared vitest.config.ts) and
// `@testing-library/jest-dom/vitest` imported locally so the other ~70
// node-environment tests are unaffected.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OcrConsentDialog } from './ocr-consent-dialog';
import { Providers } from './providers';

// jsdom doesn't implement `HTMLDialogElement.prototype.showModal()`/`close()`
// (see https://github.com/jsdom/jsdom/issues/3294). The dialog is built on the
// shared `Modal`, which relies on both, so stub them here rather than
// hand-rolling a non-native overlay just to keep jsdom happy.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});

// `globals: false` in vitest.config.ts means Testing Library's own auto
// cleanup (which detects a *global* `afterEach`) never registers, so each
// render would otherwise pile up in `document.body`.
afterEach(cleanup);

function renderDialog(props: Partial<Parameters<typeof OcrConsentDialog>[0]> = {}) {
  const onAccept = vi.fn();
  const onCancel = vi.fn();
  render(
    <Providers>
      <OcrConsentDialog onAccept={onAccept} onCancel={onCancel} pending={false} {...props} />
    </Providers>,
  );
  return { onAccept, onCancel };
}

describe('OcrConsentDialog', () => {
  it('names the risk instead of asking for blank consent', () => {
    renderDialog();
    // The user must be told the image leaves the EU and can be sensitive —
    // consent to an unexplained action is not informed consent.
    expect(screen.getByRole('dialog')).toHaveTextContent(/EU/i);
  });

  it('calls onAccept when the user agrees', async () => {
    const { onAccept } = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: /agree|souhlas/i }));
    expect(onAccept).toHaveBeenCalledOnce();
  });

  it('disables accept while the mutation is in flight', () => {
    renderDialog({ pending: true });
    expect(screen.getByRole('button', { name: /agree|souhlas/i })).toBeDisabled();
  });

  it('shows a visible message inside the dialog when saving consent fails', () => {
    // Regression for a silent failure: if `setOcrConsent.mutate` errors (e.g. a
    // network blip), the person looking at the dialog must see why their
    // consent didn't take, not just find the accept button re-enabled with no
    // explanation.
    renderDialog({ error: 'Something went wrong. Please try again.' });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Something went wrong. Please try again.');
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
  });

  it('renders no error message when none is passed', () => {
    renderDialog();
    expect(screen.queryByTestId('ocr-consent-error')).not.toBeInTheDocument();
  });
});
