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
 * or the page will quote wording the customer was never shown. A test in
 * `packages/i18n/src/marketing.test.ts` now pins the two together.
 *
 * Section 3 carries the consequence of the free trial, and it is the opposite
 * of the intuitive one: the trial does NOT push the purchase outside the
 * withdrawal window. The 14-day clock of § 1829 runs from conclusion of the
 * contract, not from the first charge, so a 7-day trial puts the first charge
 * on day 8 — inside the window — and a customer withdrawing on day 10 is owed
 * that charge back in full. The copy says so explicitly rather than staying
 * silent, because silence here reads as a denial of the right.
 *
 * No § 1834 proportionate deduction is reserved, deliberately: that section
 * applies only where performance began at the consumer's express request, and
 * `checkoutSubscription` asks for no such request (unlike `checkoutCredits`) —
 * which is exactly what section 3's first paragraph tells the reader. Absent
 * that request, Art. 14(4)(a)(ii) of Directive 2011/83/EU leaves the consumer
 * owing nothing at all. Nothing in the codebase computes a pro-rata refund
 * either.
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
  {
    h: 'legal.refunds.s3.h',
    blocks: [
      { p: 'legal.refunds.s3.p1' },
      { p: 'legal.refunds.s3.p2' },
      // The trial and the withdrawal right, in that order and kept apart.
      // `p4` exists to say the two do not interact: the 14-day clock runs from
      // contract conclusion, so the first charge (day 8 of a 7-day trial)
      // lands inside it and `p5` owes that money back — in full, matching the
      // unconditional promise `p1` already makes.
      { p: 'legal.refunds.s3.p3' },
      { p: 'legal.refunds.s3.p4' },
      { p: 'legal.refunds.s3.p5' },
    ],
  },
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
