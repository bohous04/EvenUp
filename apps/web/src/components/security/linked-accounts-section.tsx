'use client';
import { useEffect, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { useI18n } from '@/lib/i18n';
import { authErrorMessage } from '@/lib/auth-errors';
import { Panel, Section } from '@/components/ui';
import { GoogleLogo, AppleLogo, Mail } from '@/components/icons';

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
    <Section title={t('security.linked.title')}>
      <Panel as="ul" flush data-testid="linked-accounts">
        <li className="app-set-row app-set-nav">
          <span className="app-set-icon" aria-hidden>
            <Mail size={18} strokeWidth={1.75} />
          </span>
          <span className="app-set-text">
            <span className="app-set-label">{t('security.linked.password')}</span>
          </span>
          <span className="app-set-value">
            {has('credential') ? t('security.linked.connected') : '—'}
          </span>
        </li>
        {social
          .filter((s) => s.enabled)
          .map((s) => (
            <li key={s.id} className="app-set-row app-set-nav">
              <span className="app-set-icon" aria-hidden>
                <s.Logo size={18} />
              </span>
              <span className="app-set-text">
                <span className="app-set-label">{s.label}</span>
                {has(s.id) ? (
                  <span className="app-set-meta">{t('security.linked.connected')}</span>
                ) : null}
              </span>
              {has(s.id) ? (
                <button
                  type="button"
                  className="app-set-link app-set-link-quiet"
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
                </button>
              ) : (
                <button
                  type="button"
                  className="app-set-link"
                  data-testid={`link-${s.id}`}
                  onClick={() =>
                    authClient.linkSocial({ provider: s.id, callbackURL: '/settings' })
                  }
                >
                  {t('security.linked.link')}
                </button>
              )}
            </li>
          ))}
      </Panel>
      {err ? (
        <p role="alert" className="app-set-alert">
          {err}
        </p>
      ) : null}
    </Section>
  );
}
