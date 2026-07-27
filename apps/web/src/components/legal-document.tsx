import type { Metadata } from 'next';
import Link from 'next/link';
import { tMarketing, formatDate, type Locale, type MarketingKey } from '@evenup/i18n';
import { VIP_SCANS_PER_PERIOD } from '@evenup/api/billing/entitlement';
import { TRIAL_PERIOD_DAYS } from '@evenup/api/billing/prices';
import { env } from '@/server/env';
import { localizedPath } from '@/lib/locale-path';

/**
 * The one prose layout the four legal documents share — terms, privacy,
 * withdrawal/complaints and contact.
 *
 * A **pure server component**, like the landing page and for the same reason:
 * these are documents. Their text has to be in the server HTML so a crawler
 * indexes it, a no-JS visitor reads it, and — the one that actually matters
 * here — a customer can print or archive the terms they agreed to without a
 * JavaScript runtime being involved.
 *
 * Documents are declared as data (an ordered list of sections, each an ordered
 * list of blocks) rather than written as JSX per page, the same way the
 * landing page declares `FEATURES` and `FAQ`. Every block references a
 * `MarketingKey`, so a heading or paragraph that loses its catalog entry is a
 * type error rather than a blank line in a legal document.
 *
 * Three values are interpolated into every string rather than written into the
 * copy, so the documents cannot describe a product that no longer exists:
 * `{scans}` is `VIP_SCANS_PER_PERIOD` (the constant that actually gates a
 * scan), `{days}` is the configured receipt retention, and `{trialDays}` is
 * `TRIAL_PERIOD_DAYS` (what checkout sends Stripe as `trial_period_days`). All
 * three are read from the same places the running code reads them.
 *
 * `{trialDays}` is a separate name rather than a second use of `{days}`
 * precisely because this bag goes to *every* key at once: two different
 * numbers sharing one placeholder would mean the terms quoting the retention
 * period as the trial length, or the reverse, with nothing to catch it.
 */

/** The date this wording was last edited. Bump it when the copy changes. */
export const LEGAL_VERSION_DATE = '2026-07-26';

/** Real, monitored address — safe to hardcode, unlike the company details. */
export const SUPPORT_EMAIL = 'support@evenup.cz';

export type LegalSlug = 'terms' | 'privacy' | 'refunds' | 'contact';

/** Route and footer label for each document, in the order they are listed. */
export const LEGAL_DOCUMENTS: readonly { slug: LegalSlug; label: MarketingKey }[] = [
  { slug: 'terms', label: 'legal.nav.terms' },
  { slug: 'privacy', label: 'legal.nav.privacy' },
  { slug: 'refunds', label: 'legal.nav.refunds' },
  { slug: 'contact', label: 'legal.nav.contact' },
];

export type LegalBlock =
  /** One paragraph. */
  | { readonly p: MarketingKey }
  /** A bulleted list; one key per item. */
  | { readonly ul: readonly MarketingKey[] }
  /** Verbatim wording quoted from the app (or offered for the customer to use). */
  | { readonly quote: MarketingKey }
  /** The operator's name, IČO and registered address — or the missing-data notice. */
  | { readonly entity: true }
  /** A mailto link to support. */
  | { readonly email: true }
  /** Links to the other three documents. */
  | { readonly docs: true };

export interface LegalSection {
  readonly h: MarketingKey;
  readonly blocks: readonly LegalBlock[];
}

const proseText = 'text-zinc-700 dark:text-zinc-300';

export function LegalDocument({
  locale,
  slug,
  title,
  intro,
  sections,
}: {
  locale: Locale;
  slug: LegalSlug;
  title: MarketingKey;
  intro: MarketingKey;
  sections: readonly LegalSection[];
}) {
  // Passed to every lookup: `interpolate` leaves unknown placeholders intact,
  // so handing both to a string that uses neither is a no-op.
  const values = {
    scans: VIP_SCANS_PER_PERIOD,
    days: env.receiptRetentionDays,
    trialDays: TRIAL_PERIOD_DAYS,
  };
  const tm = (key: MarketingKey) => tMarketing(locale, key, values);

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:py-16">
      <h1 className="text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
        {tm(title)}
      </h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        {tMarketing(locale, 'legal.effective', {
          date: formatDate(LEGAL_VERSION_DATE, locale),
        })}
      </p>

      {env.legal.reviewed ? null : <DraftNotice locale={locale} />}

      <p className={`mt-6 text-lg ${proseText}`}>{tm(intro)}</p>

      {sections.map((section) => (
        <section key={section.h} className="mt-10">
          <h2 className="text-xl font-bold tracking-tight">{tm(section.h)}</h2>
          {section.blocks.map((block, i) => (
            // Blocks are a fixed, ordered list declared in the page module, so
            // the index is a stable key: nothing reorders or filters them.
            <Block key={i} block={block} locale={locale} slug={slug} tm={tm} />
          ))}
        </section>
      ))}
    </article>
  );
}

function Block({
  block,
  locale,
  slug,
  tm,
}: {
  block: LegalBlock;
  locale: Locale;
  slug: LegalSlug;
  tm: (key: MarketingKey) => string;
}) {
  if ('p' in block) return <p className={`mt-4 ${proseText}`}>{tm(block.p)}</p>;

  if ('ul' in block) {
    return (
      <ul className={`mt-4 list-disc space-y-2 pl-5 ${proseText}`}>
        {block.ul.map((key) => (
          <li key={key}>{tm(key)}</li>
        ))}
      </ul>
    );
  }

  if ('quote' in block) {
    return (
      <blockquote
        className={`mt-4 border-l-4 border-brand-600 bg-zinc-50 py-3 pr-4 pl-4 italic dark:bg-zinc-900 ${proseText}`}
      >
        {tm(block.quote)}
      </blockquote>
    );
  }

  if ('email' in block) {
    return (
      <p className="mt-4">
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="font-semibold text-brand-700 underline dark:text-brand-100"
        >
          {tm('legal.email.cta')}
        </a>
      </p>
    );
  }

  if ('docs' in block) return <DocumentLinks locale={locale} current={slug} />;

  return <OperatorDetails locale={locale} />;
}

/**
 * Unmissable by design, and conditional so it cannot be forgotten: it is shown
 * unless `LEGAL_REVIEWED=true` is set at build time (see `server/env.ts`).
 * Opt-out rather than opt-in, because the failure mode of the other direction
 * — shipping unreviewed drafts that look authoritative — is the expensive one.
 */
function DraftNotice({ locale }: { locale: Locale }) {
  return (
    <aside
      role="note"
      data-testid="legal-draft-notice"
      className="mt-6 rounded-2xl border-2 border-amber-500 bg-amber-50 p-4 dark:bg-amber-950/40"
    >
      <p className="font-bold text-amber-900 dark:text-amber-100">
        {tMarketing(locale, 'legal.draft.title')}
      </p>
      <p className="mt-1 text-sm text-amber-900 dark:text-amber-100">
        {tMarketing(locale, 'legal.draft.body')}
      </p>
    </aside>
  );
}

/**
 * The operator's identification, or a loud notice that it is missing.
 *
 * There is deliberately no third state: no placeholder IČO, and no silently
 * omitted row. An invented company number is a false entry in a public
 * register, and an empty line is exactly the kind of thing that survives a
 * preview and reaches production.
 */
function OperatorDetails({ locale }: { locale: Locale }) {
  const { entityName, ico, address } = env.legal;

  if (!entityName || !ico || !address) {
    return (
      <aside
        role="note"
        data-testid="legal-entity-missing"
        className="mt-4 rounded-2xl border-2 border-red-500 bg-red-50 p-4 dark:bg-red-950/40"
      >
        <p className="font-bold text-red-900 dark:text-red-100">
          {tMarketing(locale, 'legal.entity.missing.title')}
        </p>
        <p className="mt-1 text-sm text-red-900 dark:text-red-100">
          {tMarketing(locale, 'legal.entity.missing.body')}
        </p>
      </aside>
    );
  }

  return (
    <dl
      data-testid="legal-entity"
      className={`mt-4 grid gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr] ${proseText}`}
    >
      <dt className="font-semibold">{tMarketing(locale, 'legal.entity.name')}</dt>
      <dd>{entityName}</dd>
      <dt className="font-semibold">{tMarketing(locale, 'legal.entity.ico')}</dt>
      <dd>{ico}</dd>
      <dt className="font-semibold">{tMarketing(locale, 'legal.entity.address')}</dt>
      <dd>{address}</dd>
      <dt className="font-semibold">{tMarketing(locale, 'legal.entity.email')}</dt>
      <dd>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="text-brand-700 underline dark:text-brand-100"
        >
          {SUPPORT_EMAIL}
        </a>
      </dd>
    </dl>
  );
}

/** Cross-links to the sibling documents, locale-resolved. */
function DocumentLinks({ locale, current }: { locale: Locale; current: LegalSlug }) {
  return (
    <ul className="mt-4 space-y-2">
      {LEGAL_DOCUMENTS.filter((d) => d.slug !== current).map((d) => (
        <li key={d.slug}>
          <Link
            href={localizedPath(`/${d.slug}`, locale)}
            className="text-brand-700 underline dark:text-brand-100"
          >
            {tMarketing(locale, d.label)}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Canonical + `hreflang` metadata for a legal document, mirroring the landing
 * page: relative URLs resolved against the root layout's `metadataBase`, Czech
 * unprefixed and also `x-default`, English under `/en`.
 *
 * No OpenGraph override here, unlike the landing page. Next merges metadata
 * shallowly, so overriding `openGraph` would mean restating the whole object;
 * these pages are not the ones people share, so they simply inherit the
 * layout's card.
 */
export function legalMetadata(
  locale: Locale,
  slug: LegalSlug,
  keys: { title: MarketingKey; description: MarketingKey },
): Metadata {
  const cs = `/${slug}`;
  const en = `/en/${slug}`;
  return {
    title: tMarketing(locale, keys.title),
    description: tMarketing(locale, keys.description),
    alternates: {
      canonical: locale === 'cs' ? cs : en,
      languages: { cs, en, 'x-default': cs },
    },
  };
}
