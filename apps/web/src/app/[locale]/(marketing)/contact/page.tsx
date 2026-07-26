import type { Metadata } from 'next';
import { resolveLocale } from '@/lib/locale-param';
import { LegalDocument, legalMetadata, type LegalSection } from '@/components/legal-document';

/**
 * Contact and operator identification, at `/contact` (`/en/contact`).
 *
 * The business name, IČO and registered address come from
 * `LEGAL_ENTITY_NAME` / `LEGAL_ENTITY_ICO` / `LEGAL_ENTITY_ADDRESS` (see
 * `server/env.ts`). They are not hardcoded, and there is no placeholder: an
 * invented IČO is a false entry in a public register. With any of the three
 * unset, `{ entity: true }` renders a red "not configured" notice instead —
 * loud on purpose, so the gap is impossible to miss in a preview.
 *
 * `support@evenup.cz` is a real, monitored address and is hardcoded in
 * `legal-document.tsx` alongside the copy that names it.
 */
const SECTIONS: readonly LegalSection[] = [
  { h: 'legal.contact.s1.h', blocks: [{ entity: true }] },
  {
    h: 'legal.contact.s2.h',
    blocks: [{ p: 'legal.contact.s2.p1' }, { email: true }, { p: 'legal.contact.s2.p2' }],
  },
  { h: 'legal.contact.s3.h', blocks: [{ p: 'legal.contact.s3.p1' }] },
  { h: 'legal.contact.s4.h', blocks: [{ p: 'legal.contact.s4.p1' }] },
  { h: 'legal.contact.s5.h', blocks: [{ docs: true }] },
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  return legalMetadata(locale, 'contact', {
    title: 'legal.contact.meta.title',
    description: 'legal.contact.meta.description',
  });
}

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = resolveLocale((await params).locale);
  return (
    <LegalDocument
      locale={locale}
      slug="contact"
      title="legal.contact.title"
      intro="legal.contact.intro"
      sections={SECTIONS}
    />
  );
}
