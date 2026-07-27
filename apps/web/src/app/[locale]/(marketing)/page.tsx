import type { Metadata } from 'next';
import Link from 'next/link';
import {
  t,
  tMarketing,
  formatCurrency,
  TRIMMED_PRICE_FORMAT,
  type Locale,
  type MarketingKey,
} from '@evenup/i18n';
import { currencyForLocale, TRIAL_PERIOD_DAYS } from '@evenup/api/billing/prices';
import {
  DISPLAY_PACK_SIZES,
  displayPackPriceMinor,
  displaySubscriptionPriceMinor,
} from '@evenup/api/billing/display-prices';
import { VIP_SCANS_PER_PERIOD } from '@evenup/api/billing/entitlement';
import { env } from '@/server/env';
import { LandingCta } from '@/components/landing-cta';
import { resolveLocale } from '@/lib/locale-param';
import { localizedPath } from '@/lib/locale-path';

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
      images: [{ url: '/opengraph-image.png', ...imageProps }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [{ url: '/twitter-image.png', ...imageProps }],
    },
  };
}

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = resolveLocale((await params).locale);

  return (
    <>
      <Hero locale={locale} />
      <Features locale={locale} />
      <Pricing locale={locale} />
      <Faq locale={locale} />
      <ClosingCta locale={locale} />
    </>
  );
}

/* ------------------------------------------------------------------ layout */

function Section({
  id,
  className = '',
  children,
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={`mx-auto w-full max-w-5xl px-4 py-14 ${className}`}>
      {children}
    </section>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{children}</h2>;
}

const cardClass =
  'rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900';
const primaryButtonClass =
  'inline-flex items-center justify-center rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700';
const secondaryButtonClass =
  'inline-flex items-center justify-center rounded-xl border border-brand-600 px-5 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50 dark:text-brand-100 dark:hover:bg-brand-600/10';

/* ----------------------------------------------------------------- content */

function Hero({ locale }: { locale: Locale }) {
  const tm = (key: MarketingKey) => tMarketing(locale, key);
  return (
    <Section className="pt-16 pb-6 text-center sm:pt-24">
      <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">
        {tm('marketing.hero.title')}
      </h1>
      <p className="mx-auto mt-5 max-w-2xl text-lg text-zinc-600 dark:text-zinc-300">
        {tm('marketing.hero.subtitle')}
      </p>
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link
          href={localizedPath('/sign-up', locale)}
          data-testid="landing-signup"
          className={`w-full sm:w-auto ${primaryButtonClass}`}
        >
          {tm('marketing.hero.ctaPrimary')}
        </Link>
        <LandingCta
          testId="landing-hero-app"
          href={localizedPath('/groups', locale)}
          signedOutLabel={tm('marketing.hero.ctaSignIn')}
          signedInLabel={tm('marketing.hero.ctaApp')}
          className="inline-flex w-full items-center justify-center rounded-xl border border-zinc-200 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 sm:w-auto dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        />
      </div>
      <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">{t(locale, 'app.tagline')}</p>
    </Section>
  );
}

/**
 * The five things the product is genuinely differentiated by, in the order the
 * hero promises them. Written out as key pairs rather than assembled from a
 * slug so every key stays statically checked against the catalog.
 */
const FEATURES: readonly (readonly [MarketingKey, MarketingKey])[] = [
  ['marketing.feature.debts.title', 'marketing.feature.debts.body'],
  ['marketing.feature.ocr.title', 'marketing.feature.ocr.body'],
  ['marketing.feature.qr.title', 'marketing.feature.qr.body'],
  ['marketing.feature.currency.title', 'marketing.feature.currency.body'],
  ['marketing.feature.guests.title', 'marketing.feature.guests.body'],
];

function Features({ locale }: { locale: Locale }) {
  return (
    <Section id="features">
      <SectionHeading>{tMarketing(locale, 'marketing.features.title')}</SectionHeading>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(([title, body]) => (
          <article key={title} className={cardClass}>
            <h3 className="text-base font-bold tracking-tight">{tMarketing(locale, title)}</h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              {tMarketing(locale, body)}
            </p>
          </article>
        ))}
      </div>
    </Section>
  );
}

function Pricing({ locale }: { locale: Locale }) {
  const tm = (key: MarketingKey, values?: Record<string, string | number>) =>
    tMarketing(locale, key, values);
  const currency = currencyForLocale(locale);
  // A price list advertises round numbers — "50 Kč", "€2" — so a whole amount
  // sheds its ",00". The VIP panel in the app formats the same figures the
  // same way; `TRIMMED_PRICE_FORMAT` is shared with it, so the two stay in
  // step by construction rather than by convention.
  const money = (minor: number) => formatCurrency(minor, currency, locale, TRIMMED_PRICE_FORMAT);

  return (
    <Section id="pricing">
      <SectionHeading>{tm('marketing.pricing.title')}</SectionHeading>
      <p className="mt-3 max-w-2xl text-zinc-600 dark:text-zinc-300">
        {tm('marketing.pricing.subtitle')}
      </p>

      <div className="mt-8 grid gap-4 lg:grid-cols-3" data-testid="pricing">
        <article className={cardClass}>
          <h3 className="text-base font-bold tracking-tight">
            {tm('marketing.pricing.free.title')}
          </h3>
          <p className="mt-2 text-3xl font-extrabold tracking-tight">
            {tm('marketing.pricing.free.price')}
          </p>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
            {tm('marketing.pricing.free.body')}
          </p>
        </article>

        <article className="rounded-2xl border-2 border-brand-600 bg-white p-5 dark:bg-zinc-900">
          <h3 className="text-base font-bold tracking-tight">
            {tm('marketing.pricing.vip.title')}
          </h3>
          <p className="mt-2 text-3xl font-extrabold tracking-tight" data-testid="pricing-vip">
            {money(displaySubscriptionPriceMinor(currency))}{' '}
            <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              {tm('marketing.pricing.vip.period')}
            </span>
          </p>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
            {/* Both numbers are product constants, not copy — the catalog
                interpolates them so neither can drift from what the code does:
                `VIP_SCANS_PER_PERIOD` is what actually gates a scan, and
                `receiptRetentionDays` is what the cleanup job actually deletes
                on. Advertising stored photos without the second one promised
                storage the product does not provide, and disagreed with the
                terms, which quote the same value. */}
            {tm('marketing.pricing.vip.body', {
              scans: VIP_SCANS_PER_PERIOD,
              days: env.receiptRetentionDays,
            })}
          </p>
          {/* The trial belongs on the public price list, not only behind the
              sign-in wall: it is the offer, and a visitor deciding whether to
              register is exactly who needs to know a card is required up
              front. `TRIAL_PERIOD_DAYS` is what checkout sends Stripe, so the
              advertised length cannot drift from the granted one. */}
          <p
            className="mt-3 text-sm font-medium text-brand-700 dark:text-brand-100"
            data-testid="pricing-vip-trial"
          >
            {tm('marketing.pricing.vip.trial', { trialDays: TRIAL_PERIOD_DAYS })}
          </p>
        </article>

        <article className={cardClass}>
          <h3 className="text-base font-bold tracking-tight">
            {tm('marketing.pricing.packs.title')}
          </h3>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            {tm('marketing.pricing.packs.body')}
          </p>
          <dl className="mt-4 space-y-2 text-sm">
            {DISPLAY_PACK_SIZES.map((scans) => {
              const minor = displayPackPriceMinor(currency, scans);
              // An unpriced size drops out of the list rather than showing a
              // pack with a blank — or invented — amount beside it.
              if (minor === undefined) return null;
              return (
                <div key={scans} className="flex items-baseline justify-between gap-3">
                  <dt className="text-zinc-600 dark:text-zinc-300">
                    {tm('marketing.pricing.packs.item', { scans })}
                  </dt>
                  <dd className="font-semibold" data-testid={`pricing-pack-${scans}`}>
                    {money(minor)}
                  </dd>
                </div>
              );
            })}
          </dl>
        </article>
      </div>

      <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
        {tm('marketing.pricing.note')}
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link href={localizedPath('/sign-up', locale)} className={primaryButtonClass}>
          {tm('marketing.pricing.cta')}
        </Link>
        {/* The public route to checkout. `/vip` lives in the `(app)` group and
            stays `noindex` — it is an account page, and this price list is the
            public pricing story — but before this link existed nothing at all
            pointed at it, so the only way to buy was to type the URL. A
            signed-out visitor who follows it meets a sign-in prompt there
            rather than a dead end. */}
        <Link
          href={localizedPath('/vip', locale)}
          className={secondaryButtonClass}
          data-testid="pricing-vip-cta"
        >
          {tm('marketing.pricing.ctaVip')}
        </Link>
      </div>
    </Section>
  );
}

/** Four question/answer pairs, rendered flat so a crawler reads every answer. */
const FAQ: readonly (readonly [MarketingKey, MarketingKey])[] = [
  ['marketing.faq.q1', 'marketing.faq.a1'],
  ['marketing.faq.q2', 'marketing.faq.a2'],
  ['marketing.faq.q3', 'marketing.faq.a3'],
  ['marketing.faq.q4', 'marketing.faq.a4'],
];

function Faq({ locale }: { locale: Locale }) {
  return (
    <Section id="faq">
      <SectionHeading>{tMarketing(locale, 'marketing.faq.title')}</SectionHeading>
      <dl className="mt-8 grid gap-6 sm:grid-cols-2">
        {FAQ.map(([question, answer]) => (
          <div key={question}>
            <dt className="font-bold tracking-tight">{tMarketing(locale, question)}</dt>
            <dd className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              {tMarketing(locale, answer)}
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

function ClosingCta({ locale }: { locale: Locale }) {
  const tm = (key: MarketingKey) => tMarketing(locale, key);
  return (
    <Section className="pb-24">
      <div className="rounded-3xl bg-brand-600 px-6 py-12 text-center text-white sm:px-12">
        <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          {tm('marketing.cta.title')}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-brand-50">{tm('marketing.cta.body')}</p>
        <Link
          href={localizedPath('/sign-up', locale)}
          data-testid="landing-cta-signup"
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50"
        >
          {tm('marketing.cta.button')}
        </Link>
      </div>
    </Section>
  );
}
