// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { tMarketing } from '@evenup/i18n';
import type { LegalSection } from './legal-document';

/**
 * The two fail-loud behaviours of the legal pages, which are the whole reason
 * the company details and the review flag are configuration rather than copy:
 *
 * - an unset `LEGAL_ENTITY_*` must produce a **visible notice**, never a blank
 *   line and never an invented IČO — a missing company number has to be
 *   impossible to miss in a preview;
 * - the "draft, pending legal review" banner is shown **unless** somebody
 *   deliberately sets `LEGAL_REVIEWED=true`, so it cannot be forgotten before
 *   launch, only switched off on purpose.
 *
 * `server/env.ts` reads `process.env` once, at module scope, so every case
 * stubs the environment and then re-imports the module graph. That is also
 * exactly why these values are baked in at `next build` time — see the comment
 * on `env.legal`.
 */

// `globals: false` in vitest.config.ts means Testing Library's auto cleanup
// never registers, so renders would otherwise pile up across cases.
afterEach(cleanup);

const SECTIONS: readonly LegalSection[] = [{ h: 'legal.contact.s1.h', blocks: [{ entity: true }] }];

async function renderDoc() {
  vi.resetModules();
  const { LegalDocument } = await import('./legal-document');
  render(
    <LegalDocument
      locale="cs"
      slug="contact"
      title="legal.contact.title"
      intro="legal.contact.intro"
      sections={SECTIONS}
    />,
  );
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe('the operator identification block', () => {
  it('shows a visible notice — not a blank line — when the details are unset', async () => {
    await renderDoc();

    const notice = screen.getByTestId('legal-entity-missing');
    expect(notice).toBeVisible();
    expect(notice).toHaveTextContent(tMarketing('cs', 'legal.entity.missing.title'));
    // The point of the notice: nothing that looks like real company data.
    expect(screen.queryByTestId('legal-entity')).not.toBeInTheDocument();
  });

  it('renders the details once all three are configured', async () => {
    vi.stubEnv('LEGAL_ENTITY_NAME', 'Zkušební s.r.o.');
    vi.stubEnv('LEGAL_ENTITY_ICO', '00000000');
    vi.stubEnv('LEGAL_ENTITY_ADDRESS', 'Zkušební 1, 110 00 Praha 1');
    await renderDoc();

    const details = screen.getByTestId('legal-entity');
    expect(details).toHaveTextContent('Zkušební s.r.o.');
    expect(details).toHaveTextContent('00000000');
    expect(details).toHaveTextContent('Zkušební 1, 110 00 Praha 1');
    expect(screen.queryByTestId('legal-entity-missing')).not.toBeInTheDocument();
  });

  it('still warns when only some of the details are set', async () => {
    // A partially-filled entity is the dangerous case: it would otherwise
    // render a company block with a silently missing IČO row.
    vi.stubEnv('LEGAL_ENTITY_NAME', 'Zkušební s.r.o.');
    vi.stubEnv('LEGAL_ENTITY_ADDRESS', 'Zkušební 1, 110 00 Praha 1');
    await renderDoc();

    expect(screen.getByTestId('legal-entity-missing')).toBeVisible();
    expect(screen.queryByTestId('legal-entity')).not.toBeInTheDocument();
  });
});

describe('the draft notice', () => {
  it('is shown by default, so it cannot be forgotten', async () => {
    await renderDoc();

    const notice = screen.getByTestId('legal-draft-notice');
    expect(notice).toBeVisible();
    expect(notice).toHaveTextContent(tMarketing('cs', 'legal.draft.title'));
  });

  it('is removed only by an explicit LEGAL_REVIEWED=true', async () => {
    vi.stubEnv('LEGAL_REVIEWED', 'true');
    await renderDoc();

    expect(screen.queryByTestId('legal-draft-notice')).not.toBeInTheDocument();
  });

  it('is NOT removed by a merely truthy value', async () => {
    vi.stubEnv('LEGAL_REVIEWED', '1');
    await renderDoc();

    expect(screen.getByTestId('legal-draft-notice')).toBeVisible();
  });
});
