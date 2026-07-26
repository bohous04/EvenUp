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
export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
