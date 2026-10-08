import { resolveLocale } from '@/lib/locale-param';
import { MarketingHeader } from '@/components/landing/hero';
import { MarketingFooter } from '@/components/landing/closing';
import { landingFont } from '@/components/landing/font';
import '@/app/landing.css';

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
 * The header and footer components live with the landing sections they are
 * judged with (`components/landing/hero.tsx` and `closing.tsx`); the wrapper
 * here applies the marketing typeface and the `.lp` design tokens
 * (`app/landing.css`) to every public page.
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

  return (
    <div className={`lp ${landingFont.variable} flex min-h-full flex-col`}>
      <MarketingHeader locale={locale} />
      <main className="flex-1">{children}</main>
      <MarketingFooter locale={locale} />
    </div>
  );
}
