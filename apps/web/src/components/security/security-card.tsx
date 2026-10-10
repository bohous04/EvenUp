'use client';
import { useEffect, useState } from 'react';
import { authClient, useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { useI18n } from '@/lib/i18n';
import { Panel, Section } from '@/components/ui';
import { SetNavRow } from '@/components/settings-rows';
import { KeyRound, ShieldCheck } from '@/components/icons';
import { PasswordSection } from './password-section';
import { LinkedAccountsSection } from './linked-accounts-section';
import { TwoFactorSection } from './two-factor-section';

export function SecurityCard() {
  const { t } = useI18n();
  const { data: session } = useSession();
  const me = trpc.user.me.useQuery(undefined, { enabled: !!session?.user });
  const utils = trpc.useUtils();
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);

  useEffect(() => {
    void authClient.listAccounts().then((res) => {
      const ids = res.data?.map((a) => a.providerId) ?? [];
      setHasPassword(ids.includes('credential'));
    });
  }, []);

  if (!session?.user) return null;
  const ready = !!me.data && hasPassword !== null;
  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_ENABLED === 'true';
  const appleEnabled = process.env.NEXT_PUBLIC_APPLE_ENABLED === 'true';

  return (
    <>
      <Section title={t('security.title')}>
        <Panel flush>
          {ready ? (
            <>
              <PasswordSection hasPassword={hasPassword} email={session.user.email} />
              <TwoFactorSection
                enabled={me.data?.twoFactorEnabled ?? false}
                hasPassword={hasPassword}
                onChanged={() => void utils.user.me.invalidate()}
              />
            </>
          ) : (
            // Same rows, inert, while the account loads: nothing below moves.
            <>
              <SetNavRow
                label={t('security.password.title')}
                icon={<KeyRound size={18} strokeWidth={1.75} />}
                disabled
                aria-busy
              />
              <SetNavRow
                label={t('security.2fa.title')}
                icon={<ShieldCheck size={18} strokeWidth={1.75} />}
                disabled
                aria-busy
              />
            </>
          )}
        </Panel>
      </Section>
      <LinkedAccountsSection googleEnabled={googleEnabled} appleEnabled={appleEnabled} />
    </>
  );
}
