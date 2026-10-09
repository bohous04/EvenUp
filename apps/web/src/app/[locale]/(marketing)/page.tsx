import type { Metadata } from 'next';
import { tMarketing } from '@evenup/i18n';
import { Hero } from '@/components/landing/hero';
import { How } from '@/components/landing/how';
import { Product } from '@/components/landing/product';
import { Features } from '@/components/landing/features';
import { Pricing } from '@/components/landing/pricing';
import { Closing } from '@/components/landing/closing';
import { resolveLocale } from '@/lib/locale-param';

/**
 * The public landing page — the product's front door, at `/` in Czech and
 * `/en` in English. The signed-in dashboard moved to `/groups`.
 *
 * A **pure server component**. Every string comes from the marketing catalog
 * through the pure `tMarketing(locale, key)` translator, so the finished copy
 * sits in the server HTML: search engines index the right language, and a
 * visitor with JavaScript off — or still loading it — reads a complete page
 * rather than the blank frame you get when content exists only in the RSC
 * flight payload. (That is a real failure mode here: the 404 page had exactly
 * that bug.) There is one client island, `<LandingCta>`, and all it does is
 * swap a link's label.
 *
 * Each section is its own server component under `components/landing/<key>`
 * with its own stylesheet; shared tokens, type and motion live in
 * `app/landing.css` (imported by the marketing layout), whose header comment
 * is the visual system every section follows.
 *
 * Prices come from `display-prices.ts` and render through the locale-aware
 * `formatCurrency`, so no amount and no currency symbol is ever written into
 * the copy. Czech pages are priced in CZK and English in EUR — the same
 * `currencyForLocale` rule checkout itself applies, so the number a visitor
 * reads here is the one they meet in Stripe.
 *
 * Nothing here touches Stripe, so the page renders identically on a
 * self-hosted instance with billing switched off; the FAQ says as much.
 *
 * Every link out of this page goes through `localizedPath`. Czech is the
 * unprefixed default and English lives under `/en`, so a literal `/sign-up`
 * href is the *Czech* sign-up — writing one hands the entire English
 * acquisition funnel to a Czech page.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const title = tMarketing(locale, 'marketing.meta.title');
  const description = tMarketing(locale, 'marketing.meta.description');
  const imageAlt = tMarketing(locale, 'marketing.meta.ogImageAlt');
  // The dimensions of `app/opengraph-image.png` / `twitter-image.png` (both
  // 2400×1260 PNGs — see the note above `generateMetadata` on where they
  // live) — declared explicitly below because a bare URL string in `images`
  // loses them.
  const imageProps = { width: 2400, height: 1260, type: 'image/png', alt: imageAlt } as const;
  return {
    title,
    description,
    alternates: {
      canonical: locale === 'cs' ? '/' : '/en',
      languages: { cs: '/', en: '/en', 'x-default': '/' },
    },
    // Next merges metadata *shallowly*: these two objects replace the root
    // layout's wholesale rather than extending them, so everything inherited
    // has to be restated here. Miss it and the one page anybody actually
    // shares — this one — is the only page in the app without a social card,
    // while `/groups`, which nobody shares, keeps the full one.
    //
    // `images` must be the full object, not a bare URL string: a string loses
    // `width`/`height`/`type`/`alt` entirely, and — the one that matters most
    // — Next's own auto-discovered file-convention metadata (which `/groups`
    // gets, because it never overrides `openGraph.images`) also carries a
    // `?<contenthash>` query on the URL, so a social platform's cached copy
    // busts itself the moment the image file changes. This handwritten object
    // cannot reproduce that hash — it is computed by Next's build pipeline
    // from the file's contents, not something to fake here — so a redesign of
    // `opengraph-image.png` will need a cache-busting nudge of its own (e.g. a
    // renamed file, or a manual `?v=` query) until this is generated rather
    // than declared.
    openGraph: {
      type: 'website',
      siteName: 'EvenUp',
      title,
      description,
      locale: locale === 'cs' ? 'cs_CZ' : 'en_US',
      alternateLocale: locale === 'cs' ? 'en_US' : 'cs_CZ',
      images: [{ url: '/opengraph-image.png?v=2', ...imageProps }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [{ url: '/twitter-image.png?v=2', ...imageProps }],
    },
  };
}

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = resolveLocale((await params).locale);

  // The order is the argument: the claim and the product, then the proof
  // (two debts netting into one, and the same at scale), the real app, what
  // else it does, the price, and the questions that remain.
  return (
    <>
      <Hero locale={locale} />
      <How locale={locale} />
      <Product locale={locale} />
      <Features locale={locale} />
      <Pricing locale={locale} />
      <Closing locale={locale} />
    </>
  );
}
