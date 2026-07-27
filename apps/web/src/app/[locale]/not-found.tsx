import Link from 'next/link';
import { headers } from 'next/headers';
import { t, LOCALES, DEFAULT_LOCALE, type Locale } from '@evenup/i18n';
import { AppShell } from '@/components/app-shell';
import { localizedPath } from '@/lib/locale-path';

/**
 * Rendered for any 404 inside the `[locale]` tree (typo'd URLs, an
 * unrecognized "locale" segment, or a real page's own `notFound()`).
 *
 * `not-found.tsx` is a Next.js special file that, per the framework
 * contract, receives no `params` — even though it's nested under the
 * `[locale]` dynamic segment. The middleware stamps the resolved locale onto
 * an `x-evenup-locale` request header specifically so this file can read it
 * back via `headers()` and localize its copy. The enclosing
 * `app/[locale]/layout.tsx` still renders normally around this component
 * (with its own correctly-resolved `params.locale`), which is why the 404
 * keeps its stylesheets — only the outer `<html>` tag is replaced by Next
 * with its own `<html id="__next_error__">` for a true 404 response, a Next
 * limitation this file can't work around.
 *
 * The Header is not inherited any more: app chrome now lives in
 * `(app)/layout.tsx` so the public landing page under `(marketing)` doesn't
 * get it, and Next renders a not-found boundary with the layouts of the
 * boundary's own segment — never a sibling route group's. So this file
 * renders `<AppShell>` explicitly to keep exactly the chrome it had before.
 *
 * A server component using the pure `t(locale, key)` translator, not the
 * client `useI18n()` hook, since there is no client provider this deep in
 * the error-boundary tree.
 */
export default async function NotFound() {
  const headersList = await headers();
  const raw = headersList.get('x-evenup-locale');
  const locale: Locale = (LOCALES as readonly string[]).includes(raw ?? '')
    ? (raw as Locale)
    : DEFAULT_LOCALE;

  return (
    <AppShell>
      <div className="space-y-4 py-12 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight">{t(locale, 'notFound.title')}</h1>
        <p className="text-zinc-600 dark:text-zinc-400">{t(locale, 'notFound.body')}</p>
        {/* Czech is unprefixed, English lives under `/en` — a literal `/`
            would send an English visitor home to the Czech landing page. */}
        <Link href={localizedPath('/', locale)} className="inline-block text-brand-700 underline">
          {t(locale, 'notFound.home')}
        </Link>
      </div>
    </AppShell>
  );
}
