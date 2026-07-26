import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, Share, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { signOut, useSession } from '@/lib/auth';
import { trpc } from '@/lib/trpc';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import {
  Button,
  Card,
  Checkbox,
  Chip,
  ErrorText,
  Input,
  Screen,
  SectionLabel,
  SegmentedControl,
  Title,
} from '@/ui';
import { TwoFactorSection } from '@/components/TwoFactorSection';
import { hasPushPermission, registerForPushNotifications } from '@/lib/notifications';
import type { Locale } from '@evenup/i18n';

const CURRENCIES = ['CZK', 'EUR', 'USD', 'GBP', 'PLN'] as const;

/** How long the notifications "saved" confirmation stays up, matching web. */
const NOTIF_SAVED_MS = 2500;

/**
 * Web's `MenuSheet` row (`apps/web/src/components/menu-sheet.tsx`):
 * `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium`, a faint
 * leading icon and a faint trailing chevron, tinted on interaction. Web's
 * `hover:bg-zinc-50` becomes `pressed` here.
 */
function MenuRow({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: c.spacing[3],
        minHeight: 44,
        paddingHorizontal: c.spacing[3],
        paddingVertical: c.spacing[3],
        borderRadius: c.radii.lg,
        backgroundColor: pressed ? c.rowPressed : 'transparent',
      })}
    >
      <Ionicons name={icon} size={18} color={c.textFaint} />
      <Text
        style={{
          flex: 1,
          color: c.text,
          fontSize: c.type.label.fontSize,
          fontWeight: c.type.label.fontWeight,
        }}
      >
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={c.textFaint} />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { t, locale, setLocale } = useI18n();
  const c = useTheme();
  const { data: session } = useSession();
  const utils = trpc.useUtils();

  const me = trpc.user.me.useQuery(undefined, { enabled: !!session?.user });
  const bank = trpc.user.getBankAccount.useQuery(undefined, { enabled: !!session?.user });

  /**
   * Push is per-device, so its state lives here rather than on the account:
   * `pushToken` non-null means this phone is registered with the server.
   */
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [pushBlocked, setPushBlocked] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  /** Matches web's transient "saved" confirmation on the notifications toggle. */
  const [notifSaved, setNotifSaved] = useState(false);
  const notifSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (notifSavedTimer.current) clearTimeout(notifSavedTimer.current);
    },
    [],
  );

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
    onSuccess: () => {
      void utils.notification.getSettings.invalidate();
      setNotifSaved(true);
      // Cleared on unmount below — a bare setTimeout would set state on an
      // unmounted screen if you leave the tab within the window.
      if (notifSavedTimer.current) clearTimeout(notifSavedTimer.current);
      notifSavedTimer.current = setTimeout(() => setNotifSaved(false), NOTIF_SAVED_MS);
    },
  });
  const registerPush = trpc.notification.registerPushToken.useMutation();
  const unregisterPush = trpc.notification.unregisterPushToken.useMutation();

  // Reflect the OS permission on mount without prompting — the switch should
  // show the true state before the user touches it.
  useEffect(() => {
    void (async () => {
      if (!(await hasPushPermission())) return;
      const token = await registerForPushNotifications(false).catch(() => null);
      setPushToken(token);
    })();
  }, []);

  async function togglePush(enabled: boolean) {
    setPushBusy(true);
    setPushBlocked(false);
    try {
      if (enabled) {
        // Prompts the first time; on a previous "Don't allow" iOS returns denied
        // without showing anything, which is what `pushBlocked` explains.
        const token = await registerForPushNotifications(true);
        if (!token) {
          setPushBlocked(true);
          return;
        }
        await registerPush.mutateAsync({
          token,
          platform: Platform.OS === 'android' ? 'android' : 'ios',
        });
        setPushToken(token);
      } else if (pushToken) {
        await unregisterPush.mutateAsync({ token: pushToken });
        setPushToken(null);
      }
    } finally {
      setPushBusy(false);
    }
  }

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

  const twoFactorEnabled =
    (session.user as { twoFactorEnabled?: boolean }).twoFactorEnabled ?? false;
  const notifEnabled = notif.data?.notificationsEnabled ?? true;
  const hint = { color: c.textMuted, fontSize: c.type.meta.fontSize };
  const savedRow = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: c.spacing[1],
  };

  return (
    <Screen scroll>
      {/* The tab header shows the wordmark (as on web), so the page owns its title. */}
      <Title>{t('nav.settings')}</Title>

      {/* Profile */}
      <Card>
        <SectionLabel>{t('profile.title')}</SectionLabel>
        <Text style={hint}>{me.data?.email}</Text>
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
        <SectionLabel>{t('common.language')}</SectionLabel>
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
        <SectionLabel>{t('group.baseCurrency')}</SectionLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: c.spacing[2] }}>
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
        <SectionLabel>{t('profile.bankAccount')}</SectionLabel>
        <Text style={hint}>{t('profile.bankAccountHint')}</Text>
        <Input
          value={account}
          onChangeText={setAccount}
          placeholder="19-2000145399/0800"
          autoCapitalize="none"
        />
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
        <SectionLabel>{t('settings.openRouterKey')}</SectionLabel>
        <Text style={hint}>{t('ocr.apiKeyRequired')}</Text>
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
        <SectionLabel>{t('settings.notifications.title')}</SectionLabel>
        <Checkbox
          label={t('settings.notifications.enabled')}
          checked={notifEnabled}
          // `notifEnabled` falls back to `true` until the query resolves, so
          // without this you could toggle against a value that was never real.
          disabled={notif.isPending || setNotif.isPending}
          onChange={(enabled) => setNotif.mutate({ enabled })}
          testID="notifications-enabled"
        />
        <Text style={hint}>{t('settings.notifications.hint')}</Text>

        {/*
          Push is device-scoped, so it sits under the account-wide switch and is
          disabled whenever that one is off — the server never sends to a user
          who has opted out, whatever tokens they have registered.
        */}
        <Checkbox
          label={t('settings.push.enabled')}
          checked={!!pushToken}
          disabled={!notifEnabled || pushBusy || notif.isPending}
          onChange={togglePush}
          testID="push-enabled"
        />
        <Text style={hint}>{t('settings.push.hint')}</Text>
        {pushBlocked ? <ErrorText>{t('settings.push.blocked')}</ErrorText> : null}

        {notifSaved ? (
          <View style={savedRow}>
            <Ionicons name="checkmark-circle" size={16} color={c.green} />
            <Text style={{ color: c.green, fontSize: c.type.label.fontSize }}>
              {t('settings.notifications.saved')}
            </Text>
          </View>
        ) : null}
      </Card>

      {/* Security 2FA */}
      <TwoFactorSection enabled={twoFactorEnabled} />

      {/* GDPR */}
      <Card>
        <SectionLabel>{t('settings.data.title')}</SectionLabel>
        <Button title={t('settings.data.export')} variant="secondary" onPress={exportData} />
        <Button
          title={t('settings.data.delete')}
          variant="danger"
          loading={deleteAccount.isPending}
          onPress={confirmDelete}
        />
      </Card>

      {/* Account menu — web's `MenuSheet` rows rather than stacked buttons. */}
      <Card gap={0} style={{ padding: c.spacing[2] }}>
        {me.data?.isAdmin ? (
          <MenuRow
            icon="shield-checkmark-outline"
            label={t('nav.admin')}
            onPress={() => router.push('/admin')}
          />
        ) : null}
        <MenuRow
          icon="log-out-outline"
          label={t('nav.signOut')}
          onPress={() => signOut().then(() => router.replace('/sign-in'))}
        />
      </Card>
    </Screen>
  );
}
