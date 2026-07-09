'use client';
import { useEffect, useState } from 'react';
import { authClient, useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { useI18n } from '@/lib/i18n';
import { Card, SectionLabel } from '@/components/ui';
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

  if (!session?.user || !me.data || hasPassword === null) return null;
  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_ENABLED === 'true';
  const appleEnabled = process.env.NEXT_PUBLIC_APPLE_ENABLED === 'true';

  return (
    <Card>
      <SectionLabel>{t('security.title')}</SectionLabel>
      <div className="mt-3 space-y-6">
        <PasswordSection hasPassword={hasPassword} email={session.user.email} />
        <LinkedAccountsSection googleEnabled={googleEnabled} appleEnabled={appleEnabled} />
        <TwoFactorSection
          enabled={me.data.twoFactorEnabled ?? false}
          hasPassword={hasPassword}
          onChanged={() => void utils.user.me.invalidate()}
        />
      </div>
    </Card>
  );
}
