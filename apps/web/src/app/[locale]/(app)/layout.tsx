import type { Metadata } from 'next';
import { AppShell } from '@/components/app-shell';

/**
 * Owns the app's chrome — header, centred content column, service worker.
 *
 * It used to live in `app/[locale]/layout.tsx`, but that layout also wraps the
 * public landing page, which must render with its own marketing header and
 * footer and no app chrome at all. Moving the chrome down into this route
 * group is what makes the two siblings independent; `[locale]/layout.tsx`
 * keeps only what is genuinely global (`<html>`/`<body>`, `<Providers>`).
 *
 * `app/[locale]/not-found.tsx` renders `<AppShell>` itself for the same
 * reason — Next renders a not-found boundary with its own segment's layouts,
 * so it never picks this one up.
 */
export const metadata: Metadata = {
  // The entire signed-in app — `/groups`, `/settings`, `/admin`, `/sign-up`,
  // `/invite/<token>`, `/reset-password` and every other route in this group
  // — is prerendered and crawlable now, and none of these pages set their
  // own `metadata`/`generateMetadata`, so this is inherited everywhere under
  // `(app)`. Search engines should not index the signed-in app; a
  // `/invite/<token>` URL ending up indexed would be a genuine privacy leak
  // (the token grants group access to whoever holds it). The marketing route
  // group is a sibling, not a descendant, of this layout, so it is
  // unaffected and stays indexable.
  robots: { index: false, follow: false },
};

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
