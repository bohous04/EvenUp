import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import { Header } from '@/components/header';
import { ServiceWorkerCleanup } from '@/components/service-worker';

const siteUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs" suppressHydrationWarning>
      <body className="min-h-full">
        <Providers>
          <Header />
          <main className="mx-auto w-full max-w-3xl px-4 py-6">{children}</main>
          <ServiceWorkerCleanup />
        </Providers>
      </body>
    </html>
  );
}
