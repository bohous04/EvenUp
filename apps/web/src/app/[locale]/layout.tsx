import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { LOCALES } from '@evenup/i18n';
import '../globals.css';
import { Providers } from '@/components/providers';
import { resolveLocale } from '@/lib/locale-param';
import { SITE_URL } from '@/lib/site-url';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'EvenUp',
  description: 'Open-source group expense splitter that minimizes debts.',
  manifest: '/manifest.webmanifest',
  applicationName: 'EvenUp',
  appleWebApp: { capable: true, title: 'EvenUp', statusBarStyle: 'default' },
  openGraph: {
    type: 'website',
    siteName: 'EvenUp',
    title: 'EvenUp — split the bill, settle in the fewest payments',
    description: 'Open-source group expense splitter that minimizes debts.',
    locale: 'cs_CZ',
    alternateLocale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'EvenUp — split the bill, settle in the fewest payments',
    description: 'Open-source group expense splitter that minimizes debts.',
  },
};

export const viewport: Viewport = {
  themeColor: '#4f46e5',
  width: 'device-width',
  initialScale: 1,
};

/** Both locales are known up front, so every page prerenders for each of them. */
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

/**
 * The layout that owns `<html>` and `<body>` for every page. It lives under
 * `[locale]` because the middleware rewrites every page URL into that segment
 * — Czech unprefixed (`/groups` → `/cs/groups`), English under `/en` — and
 * only here is the resolved locale known, which `lang` needs.
 *
 * There is a second, deliberately minimal layout at `app/layout.tsx`. It
 * renders no markup at all; it exists solely to give the root-level
 * `opengraph-image.png`/`twitter-image.png` a layout to inherit
 * `metadataBase` from, since they sit one level above this segment. Do not
 * delete either file without reading the comment in the other.
 *
 * It renders only what is global: the document, and `<Providers>` (tRPC,
 * React Query, the i18n context) which the client components in both route
 * groups need. Everything else — header, content column, service worker — is
 * app chrome and lives in `(app)/layout.tsx`, because the public landing page
 * under `(marketing)` is a sibling in this same segment and brings its own
 * marketing header and footer instead.
 */
export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  // In Next 15 `params` is a Promise; the synchronous form silently breaks.
  const { locale: raw } = await params;
  // Without this, `/xx/groups` would render with a bogus `lang` attribute.
  const locale = resolveLocale(raw);

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-full">
        <Providers locale={locale}>{children}</Providers>
        {/* Umami: cookieless analytics. `data-domains` keeps the evenup.lnrt.cz alias out of the stats. */}
        <Script
          src="https://analytics.lnrt.cz/script.js"
          data-website-id="157f3911-6d2c-458c-acec-4968b5421798"
          data-domains="evenup.cz"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
