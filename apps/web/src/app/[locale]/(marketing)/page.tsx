import type { Metadata } from 'next';
import Link from 'next/link';
import { t, tMarketing, formatCurrency, type Locale, type MarketingKey } from '@evenup/i18n';
import { currencyForLocale } from '@evenup/api/billing/prices';
import {
  DISPLAY_PACK_SIZES,
  displayPackPriceMinor,
  displaySubscriptionPriceMinor,
} from '@evenup/api/billing/display-prices';
import { LandingCta } from '@/components/landing-cta';
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
 * Prices come from `display-prices.ts` and render through the locale-aware
 * `formatCurrency`, so no amount and no currency symbol is ever written into
 * the copy. Czech pages are priced in CZK and English in EUR — the same
 * `currencyForLocale` rule checkout itself applies, so the number a visitor
 * reads here is the one they meet in Stripe.
 *
 * Nothing here touches Stripe, so the page renders identically on a
 * self-hosted instance with billing switched off; the FAQ says as much.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const title = tMarketing(locale, 'marketing.meta.title');
  const description = tMarketing(locale, 'marketing.meta.description');
  return {
    title,
    description,
    alternates: {
      canonical: locale === 'cs' ? '/' : '/en',
      languages: { cs: '/', en: '/en', 'x-default': '/' },
    },
    openGraph: { title, description },
    twitter: { title, description },
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
          href="/sign-up"
          data-testid="landing-signup"
          className={`w-full sm:w-auto ${primaryButtonClass}`}
        >
          {tm('marketing.hero.ctaPrimary')}
        </Link>
        <LandingCta
          testId="landing-hero-app"
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
  const money = (minor: number) => formatCurrency(minor, currency, locale);

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
          <h3 className="text-base font-bold tracking-tight">{tm('marketing.pricing.vip.title')}</h3>
          <p className="mt-2 text-3xl font-extrabold tracking-tight" data-testid="pricing-vip">
            {money(displaySubscriptionPriceMinor(currency))}{' '}
            <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              {tm('marketing.pricing.vip.period')}
            </span>
          </p>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
            {tm('marketing.pricing.vip.body')}
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

      <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">{tm('marketing.pricing.note')}</p>
      <Link href="/sign-up" className={`mt-6 ${primaryButtonClass}`}>
        {tm('marketing.pricing.cta')}
      </Link>
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
          href="/sign-up"
          data-testid="landing-cta-signup"
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50"
        >
          {tm('marketing.cta.button')}
        </Link>
      </div>
    </Section>
  );
}
