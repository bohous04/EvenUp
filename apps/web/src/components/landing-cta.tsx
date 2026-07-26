'use client';
import Link from 'next/link';
import { useSession } from '@/lib/auth-client';

/**
 * The landing page's one link into the app. It points at the caller's
 * `/groups` — which renders the dashboard for a signed-in visitor and the
 * sign-in form for everyone else — and only the label changes: "sign in" for a
 * visitor, "open the app" once a session exists.
 *
 * The href is resolved by the (server) caller through `localizedPath`, not
 * built here, so the island stays label-only and no locale has to cross the
 * client boundary. An English visitor must land on `/en/groups`: a bare
 * `/groups` is the Czech route, so hardcoding it dropped every visitor to the
 * English page into a Czech app.
 *
 * A client island rather than a `cookies()` read in the page, deliberately.
 * Touching `cookies()` in a server component opts the whole route out of
 * static rendering, and the landing page is the one page that must stay a
 * prerendered document: crawlers and no-JS visitors have to receive the real
 * copy in the HTML, not a flight payload. So the surrounding page stays a pure
 * server component and only this label resolves on the client.
 *
 * Both labels are translated by the caller (a server component), so no
 * catalog crosses the client boundary. The server renders `signedOutLabel`,
 * which is also what the client renders before the session resolves — so
 * there is no hydration mismatch, only a label that may swap once.
 */
export function LandingCta({
  href,
  signedOutLabel,
  signedInLabel,
  className,
  testId,
}: {
  /** The locale-resolved app entry point, e.g. `/groups` or `/en/groups`. */
  href: string;
  signedOutLabel: string;
  signedInLabel: string;
  className?: string;
  testId?: string;
}) {
  const { data: session } = useSession();
  return (
    <Link href={href} className={className} data-testid={testId}>
      {session?.user ? signedInLabel : signedOutLabel}
    </Link>
  );
}
