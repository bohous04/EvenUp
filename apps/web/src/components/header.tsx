'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { Locale } from '@evenup/i18n';
import { useI18n } from '@/lib/i18n';
import { useSession, signOut } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { iconButtonClass } from '@/components/ui';
import { Settings, LogOut } from '@/components/icons';
import { localizedUrl } from '@/lib/locale-path';

export function Header() {
  const { t, locale } = useI18n();
  const { data: session } = useSession();
  const me = trpc.user.me.useQuery(undefined, { enabled: !!session?.user });
  const pathname = usePathname();
  const router = useRouter();

  function switchLocale(l: Locale) {
    // Navigate only — the URL is the sole source of truth for locale, so
    // the route change is what makes `/groups` become `/en/groups`, which
    // then flows the new locale back down through `Providers`. Read
    // `search`/`hash` from `window.location` here (not `usePathname()`,
    // which strips both) so a switch on e.g. `/reset-password?token=…`
    // doesn't drop the token.
    const { search, hash } = window.location;
    router.push(localizedUrl(pathname, search, hash, l));
  }

  return (
    <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
        <Link
          href="/groups"
          aria-label={t('app.name')}
          className="text-lg font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100"
        >
          Even<span className="text-brand-600">Up</span>
        </Link>
        <nav className="flex items-center gap-1.5">
          <div
            className="flex overflow-hidden rounded-lg border border-zinc-200 text-xs dark:border-zinc-700"
            role="group"
            aria-label={t('common.language')}
          >
            {(['cs', 'en'] as const).map((l) => (
              <button
                key={l}
                onClick={() => switchLocale(l)}
                aria-pressed={locale === l}
                className={`px-2 py-1 font-medium uppercase ${
                  locale === l
                    ? 'bg-brand-600 text-white'
                    : 'bg-white text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          {session?.user ? (
            <>
              {me.data?.isAdmin ? (
                <Link
                  href="/admin"
                  className="text-sm font-medium text-brand-600 dark:text-brand-100"
                  data-testid="nav-admin"
                >
                  {t('nav.admin')}
                </Link>
              ) : null}
              <Link
                href="/settings"
                aria-label={t('nav.settings')}
                title={t('nav.settings')}
                className={iconButtonClass}
              >
                <Settings size={18} aria-hidden />
              </Link>
              <button
                type="button"
                onClick={() => signOut()}
                aria-label={t('nav.signOut')}
                title={t('nav.signOut')}
                className={iconButtonClass}
              >
                <LogOut size={18} aria-hidden />
              </button>
            </>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
