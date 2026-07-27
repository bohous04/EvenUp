import { notFound } from 'next/navigation';

/**
 * Catches every path that reaches the `[locale]` segment without matching a
 * real route — a typo'd URL (`/nonexistent-page`), an English typo
 * (`/en/nonexistent-page`), or an unrecognized "locale" that the middleware
 * treats as a plain path segment under the Czech default (`/xx/settings` →
 * `/cs/xx/settings`).
 *
 * Without this catch-all, such paths would never match anything under
 * `[locale]` and would fall through to Next's own auto-generated root
 * `/_not-found` route, which renders with a bare, chrome-less layout (no
 * stylesheets, no Header — see `app/[locale]/not-found.tsx` for the rest of
 * the fix). `notFound()` here bubbles to the nearest `not-found.tsx` up the
 * tree, i.e. `app/[locale]/not-found.tsx`, which *is* nested inside the real
 * locale layout.
 */
export default function CatchAllPage() {
  notFound();
}
