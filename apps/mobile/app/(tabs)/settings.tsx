import { useEffect, useState } from 'react';
import { Alert, Share, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { signOut, useSession } from '@/lib/auth';
import { trpc } from '@/lib/trpc';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { Button, Card, Chip, Input, Screen, SegmentedControl } from '@/ui';
import { TwoFactorSection } from '@/components/TwoFactorSection';
import type { Locale } from '@evenup/i18n';

const CURRENCIES = ['CZK', 'EUR', 'USD', 'GBP', 'PLN'] as const;

export default function SettingsScreen() {
  const router = useRouter();
  const { t, locale, setLocale } = useI18n();
  const c = useTheme();
  const { data: session } = useSession();
  const utils = trpc.useUtils();

  const me = trpc.user.me.useQuery(undefined, { enabled: !!session?.user });
  const bank = trpc.user.getBankAccount.useQuery(undefined, { enabled: !!session?.user });

  const [name, setName] = useState('');
  const [account, setAccount] = useState('');
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    if (me.data?.name) setName(me.data.name);
  }, [me.data?.name]);
  useEffect(() => {
    if (bank.data?.account) setAccount(bank.data.account);
  }, [bank.data?.account]);

  const updateProfile = trpc.user.updateProfile.useMutation({
    onSuccess: () => void utils.user.me.invalidate(),
  });
  const updateSettings = trpc.user.updateSettings.useMutation({
    onSuccess: () => void utils.user.me.invalidate(),
  });
  const setBank = trpc.user.setBankAccount.useMutation({
    onSuccess: () => void utils.user.getBankAccount.invalidate(),
  });
  const clearBank = trpc.user.clearBankAccount.useMutation({
    onSuccess: () => {
      setAccount('');
      void utils.user.getBankAccount.invalidate();
    },
  });
  const setKey = trpc.user.setOpenRouterKey.useMutation({
    onSuccess: () => {
      setApiKey('');
      void utils.user.me.invalidate();
    },
  });
  const clearKey = trpc.user.clearOpenRouterKey.useMutation({
    onSuccess: () => void utils.user.me.invalidate(),
  });

  const notif = trpc.notification.getSettings.useQuery(undefined, { enabled: !!session?.user });
  const setNotif = trpc.notification.setEnabled.useMutation({
    onSuccess: () => void utils.notification.getSettings.invalidate(),
  });
  const deleteAccount = trpc.user.deleteAccount.useMutation({
    onSuccess: async () => {
      await signOut();
      router.replace('/sign-in');
    },
  });

  if (!session?.user) {
    return (
      <Screen>
        <Button title={t('auth.signInBtn')} onPress={() => router.push('/sign-in')} />
      </Screen>
    );
  }

  function changeLocale(l: Locale) {
    setLocale(l);
    updateSettings.mutate({ locale: l });
  }

  async function exportData() {
    const data = await utils.user.exportData.fetch();
    await Share.share({ message: JSON.stringify(data, null, 2) }).catch(() => {});
  }

  function confirmDelete() {
    Alert.alert(t('settings.data.delete'), t('settings.data.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteAccount.mutate() },
    ]);
  }

  const twoFactorEnabled = (session.user as { twoFactorEnabled?: boolean }).twoFactorEnabled ?? false;
  const notifEnabled = notif.data?.notificationsEnabled ?? true;

  return (
    <Screen scroll>
      {/* Profile */}
      <Card>
        <Text style={{ color: c.text, fontWeight: '700' }}>{t('profile.title')}</Text>
        <Text style={{ color: c.textMuted, fontSize: 12 }}>{me.data?.email}</Text>
        <Input label={t('profile.nickname')} value={name} onChangeText={setName} />
        <Button
          title={t('common.save')}
          loading={updateProfile.isPending}
          disabled={!name.trim() || name.trim() === me.data?.name}
          onPress={() => updateProfile.mutate({ name: name.trim() })}
        />
      </Card>

      {/* Language */}
      <Card>
        <Text style={{ color: c.text, fontWeight: '700' }}>{t('common.language')}</Text>
        <SegmentedControl<Locale>
          options={[
            { value: 'cs', label: t('locale.czech') },
            { value: 'en', label: t('locale.english') },
          ]}
          value={locale}
          onChange={changeLocale}
        />
      </Card>

      {/* Default currency */}
      <Card>
        <Text style={{ color: c.text, fontWeight: '700' }}>{t('group.baseCurrency')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {CURRENCIES.map((cur) => (
            <Chip
              key={cur}
              label={cur}
              active={me.data?.defaultCurrency === cur}
              onPress={() => updateSettings.mutate({ defaultCurrency: cur })}
            />
          ))}
        </View>
      </Card>

      {/* Bank account */}
      <Card>
        <Text style={{ color: c.text, fontWeight: '700' }}>{t('profile.bankAccount')}</Text>
        <Text style={{ color: c.textMuted, fontSize: 12 }}>{t('profile.bankAccountHint')}</Text>
        <Input value={account} onChangeText={setAccount} placeholder="19-2000145399/0800" autoCapitalize="none" />
        <Button
          title={t('common.save')}
          loading={setBank.isPending}
          disabled={!account.trim()}
          onPress={() => setBank.mutate({ account: account.trim() })}
        />
        {me.data?.hasBankAccount ? (
          <Button title={t('common.delete')} variant="ghost" onPress={() => clearBank.mutate()} />
        ) : null}
      </Card>

      {/* OpenRouter key (BYO OCR) */}
      <Card>
        <Text style={{ color: c.text, fontWeight: '700' }}>{t('settings.openRouterKey')}</Text>
        <Input
          value={apiKey}
          onChangeText={setApiKey}
          placeholder={me.data?.hasOpenRouterKey ? '••••••••' : 'sk-or-…'}
          autoCapitalize="none"
          secureTextEntry
        />
        <Button
          title={t('common.save')}
          loading={setKey.isPending}
          disabled={apiKey.trim().length < 8}
          onPress={() => setKey.mutate({ apiKey: apiKey.trim() })}
        />
        {me.data?.hasOpenRouterKey ? (
          <Button title={t('common.delete')} variant="ghost" onPress={() => clearKey.mutate()} />
        ) : null}
      </Card>

      {/* Notifications */}
      <Card>
        <Text style={{ color: c.text, fontWeight: '700' }}>{t('settings.notifications.title')}</Text>
        <Button
          title={`${notifEnabled ? '☑' : '☐'}  ${t('settings.notifications.enabled')}`}
          variant="ghost"
          onPress={() => setNotif.mutate({ enabled: !notifEnabled })}
        />
      </Card>

      {/* Security 2FA */}
      <TwoFactorSection enabled={twoFactorEnabled} />

      {/* GDPR */}
      <Card>
        <Text style={{ color: c.text, fontWeight: '700' }}>{t('settings.data.title')}</Text>
        <Button title={t('settings.data.export')} variant="secondary" onPress={exportData} />
        <Button
          title={t('settings.data.delete')}
          variant="danger"
          loading={deleteAccount.isPending}
          onPress={confirmDelete}
        />
      </Card>

      {me.data?.isAdmin ? (
        <Button title={t('nav.admin')} variant="secondary" onPress={() => router.push('/admin')} />
      ) : null}

      <Button title={t('nav.signOut')} variant="secondary" onPress={() => signOut().then(() => router.replace('/sign-in'))} />
    </Screen>
  );
}
