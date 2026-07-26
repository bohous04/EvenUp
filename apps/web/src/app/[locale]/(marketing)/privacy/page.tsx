import type { Metadata } from 'next';
import { resolveLocale } from '@/lib/locale-param';
import { LegalDocument, legalMetadata, type LegalSection } from '@/components/legal-document';

/**
 * Privacy policy, at `/privacy` in Czech and `/en/privacy` in English.
 *
 * Every factual claim in this document was checked against the code rather
 * than assumed; the claim-to-source map lives at the top of
 * `packages/i18n/src/locales/legal.ts`. Three of them are load-bearing enough
 * to repeat here, because getting any of them wrong turns this page into a
 * false statement to a supervisory authority:
 *
 * - **Section 8 says pseudonymized, not anonymous.** `deleteUserAccount` nulls
 *   the local `userId` on retained PURCHASE and Subscription rows, but those
 *   rows keep `stripeEventId`/`stripeSubscriptionId`, which resolve in Stripe
 *   to a Customer holding the person's email. They stay personal data; the
 *   retention is lawful under Art. 17(3)(b), not because it has become
 *   anonymous. Do not "simplify" that paragraph.
 * - **Section 7 states the session/IP retention, and the purge behind it is
 *   real.** `services/session-cleanup.ts` deletes sessions whose `expiresAt`
 *   has passed, and the daily cron at `api/cron/receipt-cleanup` runs it. The
 *   line deliberately names no number of days: the session lifetime comes from
 *   the auth library's own default, which could change without anyone editing
 *   this document, whereas "once it expires, a scheduled job deletes it" is
 *   true by construction. (This bullet used to say no such job existed; it
 *   shipped in `1e3a5ac` while the policy still denied it.)
 * - **Nothing here offers group deletion as a way to erase data.** There is no
 *   such procedure: `routers/group.ts` stops at `archive`, which only stamps
 *   `archivedAt`. Sections 2 and 6 route erasure through the individual record
 *   or the account, which are the two things a user can actually do.
 */
const SECTIONS: readonly LegalSection[] = [
  {
    h: 'legal.privacy.s1.h',
    blocks: [{ p: 'legal.privacy.s1.p1' }, { entity: true }, { p: 'legal.privacy.s1.p2' }],
  },
  {
    h: 'legal.privacy.s2.h',
    blocks: [
      { p: 'legal.privacy.s2.p1' },
      {
        ul: [
          'legal.privacy.s2.li1',
          'legal.privacy.s2.li2',
          'legal.privacy.s2.li3',
          'legal.privacy.s2.li4',
          'legal.privacy.s2.li5',
          'legal.privacy.s2.li6',
          'legal.privacy.s2.li7',
          'legal.privacy.s2.li8',
          'legal.privacy.s2.li9',
        ],
      },
    ],
  },
  { h: 'legal.privacy.s3.h', blocks: [{ p: 'legal.privacy.s3.p1' }, { p: 'legal.privacy.s3.p2' }] },
  {
    h: 'legal.privacy.s4.h',
    blocks: [
      { p: 'legal.privacy.s4.p1' },
      {
        ul: [
          'legal.privacy.s4.li1',
          'legal.privacy.s4.li2',
          'legal.privacy.s4.li3',
          'legal.privacy.s4.li4',
          'legal.privacy.s4.li5',
          'legal.privacy.s4.li6',
        ],
      },
      { p: 'legal.privacy.s4.p2' },
      { p: 'legal.privacy.s4.p3' },
    ],
  },
  { h: 'legal.privacy.s5.h', blocks: [{ p: 'legal.privacy.s5.p1' }, { p: 'legal.privacy.s5.p2' }] },
  {
    h: 'legal.privacy.s6.h',
    blocks: [
      { p: 'legal.privacy.s6.p1' },
      { p: 'legal.privacy.s6.p2' },
      { p: 'legal.privacy.s6.p3' },
    ],
  },
  {
    h: 'legal.privacy.s7.h',
    blocks: [
      {
        ul: [
          'legal.privacy.s7.li1',
          'legal.privacy.s7.li2',
          'legal.privacy.s7.li3',
          'legal.privacy.s7.li4',
          'legal.privacy.s7.li5',
          'legal.privacy.s7.li6',
        ],
      },
    ],
  },
  {
    h: 'legal.privacy.s8.h',
    blocks: [
      { p: 'legal.privacy.s8.p1' },
      { p: 'legal.privacy.s8.p2' },
      { p: 'legal.privacy.s8.p3' },
      { p: 'legal.privacy.s8.p3b' },
      { p: 'legal.privacy.s8.p4' },
      { p: 'legal.privacy.s8.p5' },
    ],
  },
  {
    h: 'legal.privacy.s9.h',
    blocks: [
      {
        ul: [
          'legal.privacy.s9.li1',
          'legal.privacy.s9.li2',
          'legal.privacy.s9.li3',
          'legal.privacy.s9.li4',
          'legal.privacy.s9.li5',
          'legal.privacy.s9.li6',
        ],
      },
      { p: 'legal.privacy.s9.p1' },
      { email: true },
    ],
  },
  {
    h: 'legal.privacy.s10.h',
    blocks: [
      {
        ul: [
          'legal.privacy.s10.li1',
          'legal.privacy.s10.li2',
          'legal.privacy.s10.li3',
          'legal.privacy.s10.li4',
          'legal.privacy.s10.li5',
        ],
      },
    ],
  },
  { h: 'legal.privacy.s11.h', blocks: [{ p: 'legal.privacy.s11.p1' }] },
  { h: 'legal.privacy.s12.h', blocks: [{ p: 'legal.privacy.s12.p1' }] },
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  return legalMetadata(locale, 'privacy', {
    title: 'legal.privacy.meta.title',
    description: 'legal.privacy.meta.description',
  });
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = resolveLocale((await params).locale);
  return (
    <LegalDocument
      locale={locale}
      slug="privacy"
      title="legal.privacy.title"
      intro="legal.privacy.intro"
      sections={SECTIONS}
    />
  );
}
