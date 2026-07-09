'use client';
import { useEffect, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { useI18n } from '@/lib/i18n';
import { authErrorMessage } from '@/lib/auth-errors';
import { Button, SectionLabel } from '@/components/ui';
import { GoogleLogo, AppleLogo } from '@/components/icons';

type Provider = 'google' | 'apple';

/**
 * Lists the user's linked login methods (email+password, Google, Apple) and
 * lets them link/unlink the OAuth providers. Unlinking is disabled once only
 * one login method remains, so the user can never lock themselves out.
 */
export function LinkedAccountsSection({
  googleEnabled,
  appleEnabled,
}: {
  googleEnabled: boolean;
  appleEnabled: boolean;
}) {
  const { t } = useI18n();
  // providerIds from listAccounts, e.g. 'credential' | 'google' | 'apple'.
  const [providers, setProviders] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    const res = await authClient.listAccounts();
    if (res.data) setProviders(res.data.map((a) => a.providerId));
    else setErr(authErrorMessage(res.error?.code, t));
  };
  useEffect(() => {
    void load();
  }, []);

  const has = (p: string) => providers?.includes(p) ?? false;
  // "credential" is the email+password account; count total login methods.
  const methodCount = (providers ?? []).length;

  const social: {
    id: Provider;
    label: string;
    enabled: boolean;
    Logo: React.FC<{ size?: number }>;
  }[] = [
    { id: 'google', label: 'Google', enabled: googleEnabled, Logo: GoogleLogo },
    { id: 'apple', label: 'Apple', enabled: appleEnabled, Logo: AppleLogo },
  ];

  return (
    <div>
      <SectionLabel>{t('security.linked.title')}</SectionLabel>
      <ul className="space-y-2" data-testid="linked-accounts">
        <li className="flex items-center justify-between text-sm">
          <span>{t('security.linked.password')}</span>
          <span className="text-zinc-500 dark:text-zinc-400">
            {has('credential') ? t('security.linked.connected') : '—'}
          </span>
        </li>
        {social
          .filter((s) => s.enabled)
          .map((s) => (
            <li key={s.id} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <s.Logo size={16} /> {s.label}
              </span>
              {has(s.id) ? (
                <Button
                  variant="ghost"
                  disabled={methodCount <= 1}
                  title={methodCount <= 1 ? t('security.linked.lastMethod') : undefined}
                  data-testid={`unlink-${s.id}`}
                  onClick={async () => {
                    const res = await authClient.unlinkAccount({ providerId: s.id });
                    if (res.error) setErr(authErrorMessage(res.error.code, t));
                    else void load();
                  }}
                >
                  {t('security.linked.unlink')}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  data-testid={`link-${s.id}`}
                  onClick={() =>
                    authClient.linkSocial({ provider: s.id, callbackURL: '/settings' })
                  }
                >
                  {t('security.linked.link')}
                </Button>
              )}
            </li>
          ))}
      </ul>
      {err ? (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
          {err}
        </p>
      ) : null}
    </div>
  );
}
