'use client';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { useSession, signOut } from '@/lib/auth-client';
import { Button } from '@/components/ui';
import { Scale } from '@/components/icons';

export function Header() {
  const { t, locale, setLocale } = useI18n();
  const { data: session } = useSession();

  return (
    <header className="border-b border-neutral-200 bg-white/80 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
        <Link
          href="/"
          className="flex items-center gap-2 font-bold text-brand-700 dark:text-brand-100"
        >
          <Scale size={20} aria-hidden />
          {t('app.name')}
        </Link>
        <nav className="flex items-center gap-2">
          <div
            className="flex overflow-hidden rounded-lg border border-neutral-300 text-xs dark:border-neutral-700"
            role="group"
            aria-label="Language"
          >
            {(['cs', 'en'] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLocale(l)}
                aria-pressed={locale === l}
                className={`px-2 py-1 font-medium uppercase ${
                  locale === l
                    ? 'bg-brand-600 text-white'
                    : 'bg-white text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          {session?.user ? (
            <>
              <Link
                href="/settings"
                className="text-sm font-medium text-brand-700 dark:text-brand-100"
              >
                {t('nav.settings')}
              </Link>
              <Button variant="ghost" onClick={() => signOut()}>
                {t('nav.signOut')}
              </Button>
            </>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
