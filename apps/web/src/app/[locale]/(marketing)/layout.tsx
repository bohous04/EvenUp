import Link from 'next/link';
import { t, tMarketing, type MarketingKey } from '@evenup/i18n';
import { LandingCta } from '@/components/landing-cta';
import { MarketingLocaleSwitch } from '@/components/marketing-locale-switch';
import { LEGAL_DOCUMENTS } from '@/components/legal-document';
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
 * The layout itself is a server component, translating through the pure
 * `t(locale, key)` / `tMarketing(locale, key)` — the route is the single source
 * of truth for locale, and the copy has to be in the server HTML for crawlers
 * and no-JS visitors. Two client islands sit inside it, both label-or-href
 * only and both server-rendered into real markup: `<LandingCta>` (swaps a
 * link's label once the session resolves) and `<MarketingLocaleSwitch>` (needs
 * the current pathname, which a layout cannot see).
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
            <MarketingLocaleSwitch locale={locale} label={t(locale, 'common.language')} />
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
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-8 text-sm text-zinc-600 dark:text-zinc-400">
          {/* The legal documents are reachable from every public page — a
              consumer has to be able to find the terms they are agreeing to
              and the privacy policy without being signed in. */}
          <nav aria-label={tm('legal.nav.title')}>
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              {LEGAL_DOCUMENTS.map((doc) => (
                <li key={doc.slug}>
                  <Link
                    href={path(`/${doc.slug}`)}
                    className="hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    {tm(doc.label)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>{tm('marketing.footer.tagline')}</p>
            {SOURCE_URL ? (
              <a href={SOURCE_URL} className="text-brand-700 underline dark:text-brand-100">
                {tm('marketing.footer.source')}
              </a>
            ) : null}
          </div>
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
