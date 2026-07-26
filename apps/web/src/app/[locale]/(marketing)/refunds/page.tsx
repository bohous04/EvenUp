import type { Metadata } from 'next';
import { resolveLocale } from '@/lib/locale-param';
import { LegalDocument, legalMetadata, type LegalSection } from '@/components/legal-document';

/**
 * Withdrawal and complaints, at `/refunds` (`/en/refunds`).
 *
 * The pivot of this document is the asymmetry the code actually implements:
 * `checkoutCredits` refuses to start without `acknowledgeImmediate` and stores
 * `withdrawalConsentAt` on the resulting ledger row, so the 14-day right is
 * expressly waived for a credit pack — while `checkoutSubscription` asks for
 * no such thing, so for the subscription the right survives in full. Section 2
 * quotes the checkbox verbatim from `vip.credits.ack` in the app catalogs; if
 * that string is ever reworded, `legal.refunds.s2.quote` has to move with it,
 * or the page will quote wording the customer was never shown.
 */
const SECTIONS: readonly LegalSection[] = [
  { h: 'legal.refunds.s1.h', blocks: [{ p: 'legal.refunds.s1.p1' }] },
  {
    h: 'legal.refunds.s2.h',
    blocks: [
      { p: 'legal.refunds.s2.p1' },
      { quote: 'legal.refunds.s2.quote' },
      { p: 'legal.refunds.s2.p2' },
      { p: 'legal.refunds.s2.p3' },
    ],
  },
  { h: 'legal.refunds.s3.h', blocks: [{ p: 'legal.refunds.s3.p1' }, { p: 'legal.refunds.s3.p2' }] },
  { h: 'legal.refunds.s4.h', blocks: [{ p: 'legal.refunds.s4.p1' }] },
  {
    h: 'legal.refunds.s5.h',
    blocks: [
      { p: 'legal.refunds.s5.p1' },
      { quote: 'legal.refunds.s5.quote' },
      { p: 'legal.refunds.s5.p2' },
      { email: true },
    ],
  },
  {
    h: 'legal.refunds.s6.h',
    blocks: [
      { p: 'legal.refunds.s6.p1' },
      { p: 'legal.refunds.s6.p2' },
      { p: 'legal.refunds.s6.p3' },
    ],
  },
  { h: 'legal.refunds.s7.h', blocks: [{ p: 'legal.refunds.s7.p1' }] },
  { h: 'legal.refunds.s8.h', blocks: [{ p: 'legal.refunds.s8.p1' }] },
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  return legalMetadata(locale, 'refunds', {
    title: 'legal.refunds.meta.title',
    description: 'legal.refunds.meta.description',
  });
}

export default async function RefundsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = resolveLocale((await params).locale);
  return (
    <LegalDocument
      locale={locale}
      slug="refunds"
      title="legal.refunds.title"
      intro="legal.refunds.intro"
      sections={SECTIONS}
    />
  );
}
