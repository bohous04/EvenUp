import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-url';

/**
 * A metadata-only root layout — it renders no `<html>`/`<body>` of its own
 * (that's `app/[locale]/layout.tsx`'s job, since only it knows the resolved
 * locale for `lang`) and simply passes `children` through.
 *
 * It exists purely so `apps/web/src/app/opengraph-image.png` and
 * `twitter-image.png` — which sit at this true app root, one level above
 * `[locale]`, and therefore outside that layout's own `metadataBase` — have
 * *some* layout to inherit `metadataBase` from. Without this file, `next
 * build` warns `metadataBase property in metadata export is not set` for
 * those two routes on every build; the warning is real (`resolve-opengraph`
 * in Next's metadata resolver only walks the layout chain, never sibling
 * `page.js`/`not-found.js` files), not cosmetic.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
