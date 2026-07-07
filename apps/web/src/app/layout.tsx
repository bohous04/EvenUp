import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import { Header } from '@/components/header';
import { ServiceWorkerCleanup } from '@/components/service-worker';

export const metadata: Metadata = {
  title: 'EvenUp — dlužníček',
  description: 'Open-source group expense splitter that minimizes debts.',
  manifest: '/manifest.webmanifest',
  applicationName: 'EvenUp',
  appleWebApp: { capable: true, title: 'EvenUp', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#2563eb',
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
