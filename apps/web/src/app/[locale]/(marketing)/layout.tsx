import Link from 'next/link';
import { t, tMarketing, LOCALES, type Locale, type MarketingKey } from '@evenup/i18n';
import { LandingCta } from '@/components/landing-cta';
import { resolveLocale } from '@/lib/locale-param';
import { localizedPath } from '@/lib/locale-path';

/**
 * The public marketing chrome: its own compact header and footer, and
 * deliberately none of the app's — no signed-in `Header` (settings, sign out,
 * admin), no narrow `max-w-3xl` content column, no `ServiceWorker`.
 *
 * That separation is why the app's chrome moved out of `app/[locale]/layout.tsx`
 * and into `(app)/layout.tsx`: both route groups live under the same `[locale]`
 * segment, so a parent layout cannot give one of them chrome without giving it
 * to the other. The parent now renders only `<html>`/`<body>`/`<Providers>`.
 *
 * A server component throughout, using the pure `t(locale, key)` /
 * `tMarketing(locale, key)` translators — the route is the single source of
 * truth for locale, and the copy has to be in the server HTML for crawlers and
 * no-JS visitors.
 */
export default async function MarketingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
  const tm = (key: MarketingKey) => tMarketing(locale, key);
  // Czech is unprefixed and English lives under `/en`, so every in-app link
  // has to be built for the locale of the page it sits on — a bare `/` or
  // `/groups` in the English header would walk the visitor into the Czech app.
  const path = (to: string) => localizedPath(to, locale);

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/85 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/85">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 py-3">
          <Link
            href={path('/')}
            aria-label={t(locale, 'app.name')}
            className="text-lg font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100"
          >
            Even<span className="text-brand-600">Up</span>
          </Link>

          <nav className="ml-4 hidden items-center gap-5 text-sm font-medium text-zinc-600 sm:flex dark:text-zinc-300">
            <a href="#features" className="hover:text-zinc-900 dark:hover:text-zinc-100">
              {tm('marketing.nav.features')}
            </a>
            <a href="#pricing" className="hover:text-zinc-900 dark:hover:text-zinc-100">
              {tm('marketing.nav.pricing')}
            </a>
            <a href="#faq" className="hover:text-zinc-900 dark:hover:text-zinc-100">
              {tm('marketing.nav.faq')}
            </a>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <LocaleSwitch locale={locale} />
            <LandingCta
              testId="landing-signin"
              href={path('/groups')}
              signedOutLabel={tm('marketing.hero.ctaSignIn')}
              signedInLabel={tm('marketing.hero.ctaApp')}
              className="rounded-xl px-3 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-50 dark:text-brand-100 dark:hover:bg-brand-600/10"
            />
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-8 text-sm text-zinc-600 sm:flex-row sm:items-center sm:justify-between dark:text-zinc-400">
          <p>{tm('marketing.footer.tagline')}</p>
          {SOURCE_URL ? (
            <a href={SOURCE_URL} className="text-brand-700 underline dark:text-brand-100">
              {tm('marketing.footer.source')}
            </a>
          ) : null}
        </div>
      </footer>
    </div>
  );
}

/**
 * Where "view the source" points. Left unset by default rather than shipping a
 * placeholder repository URL that 404s; set `NEXT_PUBLIC_SOURCE_URL` at build
 * time and the footer link appears.
 */
const SOURCE_URL = process.env.NEXT_PUBLIC_SOURCE_URL;

/**
 * Plain links, not the app header's `router.push` buttons: the marketing page
 * is server-rendered and must switch language without JavaScript. Czech is the
 * unprefixed default and English lives under `/en` (see the middleware), and
 * `(marketing)` holds exactly one page, so the two targets are known
 * statically. A second marketing page would need the current pathname here.
 */
function LocaleSwitch({ locale }: { locale: Locale }) {
  const href: Record<Locale, string> = { cs: '/', en: '/en' };
  return (
    <div
      className="flex overflow-hidden rounded-lg border border-zinc-200 text-xs dark:border-zinc-700"
      role="group"
      aria-label={t(locale, 'common.language')}
    >
      {LOCALES.map((l) => (
        <Link
          key={l}
          href={href[l]}
          hrefLang={l}
          aria-current={locale === l ? 'true' : undefined}
          className={`px-2 py-1 font-medium uppercase ${
            locale === l
              ? 'bg-brand-600 text-white'
              : 'bg-white text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300'
          }`}
        >
          {l}
        </Link>
      ))}
    </div>
  );
}
