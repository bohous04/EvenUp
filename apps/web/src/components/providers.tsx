'use client';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { Locale } from '@evenup/i18n';
import { trpc } from '@/lib/trpc';
import { I18nProvider } from '@/lib/i18n';

export function Providers({ children, locale }: { children: React.ReactNode; locale: Locale }) {
  const [queryClient] = useState(() => new QueryClient());
  // The tRPC client is created once via the `useState` initialiser, but that
  // no longer risks freezing on a stale locale: a locale change is always a
  // navigation, and Next remounts this whole component (fresh `useState`,
  // fresh closure) rather than re-rendering it in place with a new `locale`
  // prop. So `locale` can be read directly here — no ref/effect needed to
  // keep it current.
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: '/api/trpc',
          transformer: superjson,
          // Tell the server which locale to translate error messages (and,
          // e.g., `billing.summary`'s currency) into. The route is the
          // source of truth for locale — see `locale-path.ts`.
          headers: () => ({ 'x-locale': locale }),
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
