'use client';
import Link from 'next/link';
import type { ComponentProps } from 'react';
import { useI18n } from '@/lib/i18n';
import { localizedPath } from '@/lib/locale-path';

/**
 * `next/link` for the signed-in app, with the locale resolved for you.
 *
 * Czech is the unprefixed default and English lives under `/en`, so a literal
 * `href="/groups"` is the *Czech* route — always, on every page. Written on an
 * English page it silently walks the visitor out of `/en`: the middleware
 * rewrites `/groups` to `/cs/groups`, the copy comes back Czech, `<html lang>`
 * flips to `cs`, and the `x-locale` header that `currencyForLocale` reads flips
 * with it. One click from `/en/vip` (priced in EUR) landed the user in a CZK
 * app. Every internal link in `(app)` had this bug.
 *
 * The marketing group solved the same problem structurally in Task 4 by making
 * `LandingCta`'s `href` a required prop, so the component could not be built
 * without a resolved path. This is the equivalent for `(app)`, taking the other
 * route available here: every page in this group is already a client component
 * inside `I18nProvider`, so the locale is in context and the resolution can
 * happen *inside* the link rather than at thirteen call sites that each have to
 * remember. Pass the plain app path — `/groups`, `/settings`, `/vip` — and this
 * emits `/groups` or `/en/groups` as appropriate.
 *
 * `localizedPath` is idempotent (it strips any locale prefix before adding the
 * right one), so passing an already-resolved path is harmless rather than
 * producing `/en/en/groups`.
 *
 * External URLs and `mailto:` do NOT belong here — they'd be mangled into
 * `/en/https://…`. Use a plain `<a>` for those; the marketing footer's source
 * link already does.
 */
export function AppLink({
  href,
  ...rest
}: Omit<ComponentProps<typeof Link>, 'href'> & { href: string }) {
  const { locale } = useI18n();
  return <Link href={localizedPath(href, locale)} {...rest} />;
}

/**
 * The same resolution for the handful of places that navigate imperatively
 * (`router.push`, a full `window.location` assignment after account deletion)
 * and so cannot render an `<AppLink>`.
 */
export function useAppPath(): (to: string) => string {
  const { locale } = useI18n();
  return (to) => localizedPath(to, locale);
}
