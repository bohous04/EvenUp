import type { Metadata } from 'next';
import { resolveLocale } from '@/lib/locale-param';
import { LegalDocument, legalMetadata, type LegalSection } from '@/components/legal-document';

/**
 * Terms of service, at `/terms` in Czech and `/en/terms` in English.
 *
 * The commercial sections describe what the code actually enforces, not what
 * a template says a SaaS charges for: the `{scans}` allowance is
 * `VIP_SCANS_PER_PERIOD`, the allowance-then-credits fall-through and the
 * "credit-funded scans store no photo" rule are `resolveScanEntitlement`, the
 * automatic credit refund on a failed scan is `ocr.scan`'s catch block, and
 * cancellation is `billing.portal`. See the header of
 * `packages/i18n/src/locales/legal.ts` for the full claim-to-source map.
 */
const SECTIONS: readonly LegalSection[] = [
  { h: 'legal.terms.s1.h', blocks: [{ p: 'legal.terms.s1.p1' }, { entity: true }] },
  { h: 'legal.terms.s2.h', blocks: [{ p: 'legal.terms.s2.p1' }, { p: 'legal.terms.s2.p2' }] },
  {
    h: 'legal.terms.s3.h',
    blocks: [
      { p: 'legal.terms.s3.p1' },
      { p: 'legal.terms.s3.p2' },
      { p: 'legal.terms.s3.p3' },
      { p: 'legal.terms.s3.p4' },
    ],
  },
  {
    h: 'legal.terms.s4.h',
    blocks: [
      { p: 'legal.terms.s4.p1' },
      { ul: ['legal.terms.s4.li1', 'legal.terms.s4.li2'] },
      { p: 'legal.terms.s4.p2' },
      { p: 'legal.terms.s4.p3' },
      { p: 'legal.terms.s4.p4' },
      { p: 'legal.terms.s4.p5' },
    ],
  },
  {
    h: 'legal.terms.s5.h',
    blocks: [{ p: 'legal.terms.s5.p1' }, { p: 'legal.terms.s5.p2' }, { p: 'legal.terms.s5.p3' }],
  },
  { h: 'legal.terms.s6.h', blocks: [{ p: 'legal.terms.s6.p1' }, { p: 'legal.terms.s6.p2' }] },
  { h: 'legal.terms.s7.h', blocks: [{ p: 'legal.terms.s7.p1' }] },
  {
    h: 'legal.terms.s8.h',
    blocks: [{ p: 'legal.terms.s8.p1' }, { p: 'legal.terms.s8.p2' }, { p: 'legal.terms.s8.p3' }],
  },
  {
    h: 'legal.terms.s9.h',
    blocks: [{ ul: ['legal.terms.s9.li1', 'legal.terms.s9.li2', 'legal.terms.s9.li3'] }],
  },
  { h: 'legal.terms.s10.h', blocks: [{ p: 'legal.terms.s10.p1' }] },
  { h: 'legal.terms.s11.h', blocks: [{ p: 'legal.terms.s11.p1' }, { p: 'legal.terms.s11.p2' }] },
  { h: 'legal.terms.s12.h', blocks: [{ p: 'legal.terms.s12.p1' }] },
  { h: 'legal.terms.s13.h', blocks: [{ p: 'legal.terms.s13.p1' }] },
  {
    h: 'legal.terms.s14.h',
    blocks: [{ p: 'legal.terms.s14.p1' }, { p: 'legal.terms.s14.p2' }, { email: true }],
  },
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  return legalMetadata(locale, 'terms', {
    title: 'legal.terms.meta.title',
    description: 'legal.terms.meta.description',
  });
}

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = resolveLocale((await params).locale);
  return (
    <LegalDocument
      locale={locale}
      slug="terms"
      title="legal.terms.title"
      intro="legal.terms.intro"
      sections={SECTIONS}
    />
  );
}
