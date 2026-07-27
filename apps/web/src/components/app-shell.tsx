import { Header } from '@/components/header';
import { ServiceWorker } from '@/components/service-worker';

/**
 * The signed-in app's chrome: the header with the language switcher and the
 * account controls, the narrow centred content column, and the service-worker
 * registration for the installed PWA.
 *
 * It lives in a component rather than directly in `app/[locale]/layout.tsx`
 * because the public landing page is a sibling of the app inside the same
 * `[locale]` segment and must NOT inherit any of it (see
 * `app/[locale]/(marketing)/layout.tsx`). Two callers need the chrome:
 *
 *  - `app/[locale]/(app)/layout.tsx` — every real app page, and
 *  - `app/[locale]/not-found.tsx` — which Next renders with the layouts of
 *    its own segment only, so it never sees the `(app)` route group's layout
 *    and has to ask for the chrome itself.
 *
 * A server component: `Header` and `ServiceWorker` are the client components
 * here, and both already sit under `<Providers>` from the root layout.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-3xl px-4 py-6">{children}</main>
      <ServiceWorker />
    </>
  );
}
