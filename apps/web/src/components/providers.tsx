'use client';
import { useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { Locale } from '@evenup/i18n';
import { trpc } from '@/lib/trpc';
import { I18nProvider } from '@/lib/i18n';

export function Providers({ children, locale }: { children: React.ReactNode; locale: Locale }) {
  const [queryClient] = useState(() => new QueryClient());
  // The tRPC client (and its `headers` closure) is created once via the
  // `useState` initialiser, so a plain read of `locale` there would freeze
  // on whatever locale was current on first render. Route to a ref instead,
  // kept current every render, so a locale change (client-side navigation
  // to `/en/...`) is picked up by the next request without recreating the
  // client.
  const localeRef = useRef(locale);
  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: '/api/trpc',
          transformer: superjson,
          // Tell the server which locale to translate error messages (and,
          // e.g., `billing.summary`'s currency) into. The route is the
          // source of truth for locale — see `locale-path.ts`.
          headers: () => ({ 'x-locale': localeRef.current }),
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <I18nProvider initialLocale={locale}>{children}</I18nProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
