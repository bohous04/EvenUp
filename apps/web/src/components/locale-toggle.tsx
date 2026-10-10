'use client';
import { usePathname, useRouter } from 'next/navigation';
import type { Locale } from '@evenup/i18n';
import { useI18n } from '@/lib/i18n';
import { localizedUrl } from '@/lib/locale-path';
import { Languages } from '@/components/icons';

/**
 * Switch to the other language. Navigate only — the URL is the sole source of
 * truth for locale, so the route change is what makes `/groups` become
 * `/en/groups`, which then flows the new locale back down through `Providers`.
 * `search`/`hash` come from `window.location` (not `usePathname()`, which
 * strips both) so a switch on e.g. `/reset-password?token=…` keeps the token.
 */
export function useLocaleSwitch() {
  const { locale } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const other: Locale = locale === 'cs' ? 'en' : 'cs';
  const otherName = other === 'cs' ? 'Čeština' : 'English';
  const go = () => {
    const { search, hash } = window.location;
    router.push(localizedUrl(pathname, search, hash, other));
  };
  return { other, otherName, go };
}

/**
 * The language switch on phones: a quiet labelled row in Settings (`.app-lang`, app/app.css) — "文A English", a 44px target.
 * Language is set once, so it costs no chrome: not in the tab bar, which is
 * kept for the places you go and the primary action, and not in a top bar.
 * Hidden from `lg`, where the left rail carries the same labelled row.
 */
export function LocaleToggle({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  const { other, otherName, go } = useLocaleSwitch();
  return (
    <button
      type="button"
      onClick={go}
      title={t('common.language')}
      lang={other}
      className={`app-lang lg:hidden ${className}`}
    >
      <Languages size={18} strokeWidth={1.75} aria-hidden />
      <span>{otherName}</span>
    </button>
  );
}
