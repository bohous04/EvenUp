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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OcrConsentDialog } from './ocr-consent-dialog';
import { Providers } from './providers';

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
});
