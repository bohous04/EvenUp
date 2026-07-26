import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { LOCALES } from '@evenup/i18n';
import '../globals.css';
import { Providers } from '@/components/providers';
import { Header } from '@/components/header';
import { ServiceWorker } from '@/components/service-worker';
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
 */
export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  // In Next 15 `params` is a Promise; the synchronous form silently breaks.
  const { locale } = await params;
  // Without this, `/xx/groups` would render with a bogus `lang` attribute.
  if (!(LOCALES as readonly string[]).includes(locale)) notFound();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-full">
        <Providers>
          <Header />
          <main className="mx-auto w-full max-w-3xl px-4 py-6">{children}</main>
          <ServiceWorker />
        </Providers>
      </body>
    </html>
  );
}
