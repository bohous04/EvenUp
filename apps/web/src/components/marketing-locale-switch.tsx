'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LOCALES, type Locale } from '@evenup/i18n';
import { localizedPath } from '@/lib/locale-path';

/**
 * The language toggle in the marketing header.
 *
 * It used to live inline in the layout with the two targets hardcoded as `/`
 * and `/en`, which was correct for exactly as long as `(marketing)` held one
 * page — the comment there said as much. With the legal documents added, a
 * hardcoded `/en` on `/privacy` would drop a reader out of the document they
 * were reading and onto the English landing page.
 *
 * A layout cannot know its own pathname in the App Router, so this is the one
 * client island in the marketing chrome. Two properties make that safe:
 *
 * - **It renders real `href`s, server-side.** `<Link>` is an `<a>` in the
 *   prerendered HTML, so switching language still works with JavaScript off —
 *   which the landing page has an explicit e2e test for.
 * - **`localizedPath` normalizes the locale prefix**, so it does not matter
 *   whether `usePathname()` reports the internal prerender path (`/cs/privacy`)
 *   or the browser's (`/privacy`): both yield the same pair of hrefs, and
 *   hydration has nothing to correct.
 *
 * The `aria-label` arrives already translated from the (server) caller, so no
 * catalog crosses the client boundary — the same convention `LandingCta` uses.
 */
export function MarketingLocaleSwitch({ locale, label }: { locale: Locale; label: string }) {
  const pathname = usePathname();

  return (
    <div className="lp-locale" role="group" aria-label={label}>
      {LOCALES.map((l) => (
        <Link
          key={l}
          href={localizedPath(pathname, l)}
          hrefLang={l}
          aria-current={locale === l ? 'true' : undefined}
        >
          {l}
        </Link>
      ))}
    </div>
  );
}
