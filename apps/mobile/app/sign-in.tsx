import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { authClient, signIn } from '@/lib/auth';
import { SocialAuth } from '@/components/SocialAuth';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { Button, Input, Screen } from '@/ui';

export default function SignInScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const c = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 2FA step: shown in place of the email/password form when the account
  // requires a second factor (Better Auth returns `{ twoFactorRedirect: true }`
  // and creates no session until the code is verified).
  const [twoFactor, setTwoFactor] = useState(false);
  const [code, setCode] = useState('');
  const [useBackup, setUseBackup] = useState(false);
  const [trustDevice, setTrustDevice] = useState(false);

  async function submit() {
    setLoading(true);
    setError(null);
    const res = await signIn.email({ email, password });
    setLoading(false);
    if (res.error) {
      setError(
        res.error.code === 'EMAIL_NOT_VERIFIED'
          ? t('auth.err.unverified')
          : t('auth.err.invalidCredentials'),
      );
      return;
    }
    if ((res.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
      setTwoFactor(true);
      return;
    }
    router.replace('/');
  }

  async function submitTwoFactor() {
    setLoading(true);
    setError(null);
    const res = useBackup
      ? await authClient.twoFactor.verifyBackupCode({ code })
      : await authClient.twoFactor.verifyTotp({ code, trustDevice });
    setLoading(false);
    if (res.error) setError(t('auth.err.invalidCredentials'));
    else router.replace('/');
  }

  if (twoFactor) {
    return (
      <Screen padded={false} style={styles.container}>
        <Text style={[styles.heading, { color: c.text }]}>
          {useBackup ? t('security.2fa.backupTitle') : t('security.2fa.title')}
        </Text>
        <Input
          label={useBackup ? t('security.2fa.backupTitle') : t('security.2fa.code')}
          keyboardType={useBackup ? 'default' : 'number-pad'}
          autoCapitalize="none"
          value={code}
          onChangeText={setCode}
          autoFocus
          testID="signin-2fa-code"
        />
        {!useBackup ? (
          <Button
            title={`${trustDevice ? '☑' : '☐'}  ${t('security.2fa.trustDevice')}`}
            variant="ghost"
            onPress={() => setTrustDevice((v) => !v)}
          />
        ) : null}
        {error ? (
          <Text style={{ color: c.danger, textAlign: 'center' }} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <Button
          title={loading ? t('common.loading') : t('security.2fa.confirm')}
          onPress={submitTwoFactor}
          loading={loading}
          testID="signin-2fa-submit"
        />
        <Button
          title={useBackup ? t('security.2fa.usePassword') : t('security.2fa.useBackup')}
          variant="ghost"
          onPress={() => {
            setUseBackup((v) => !v);
            setCode('');
            setError(null);
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen padded={false} style={styles.container}>
      <Text style={[styles.heading, { color: c.text }]}>{t('app.name')}</Text>
      <Text style={[styles.tagline, { color: c.textMuted }]}>{t('app.tagline')}</Text>
      <Input
        placeholder="you@example.com"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        label={t('auth.email')}
      />
      <Input
        placeholder={t('auth.password')}
        autoCapitalize="none"
        autoComplete="current-password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        label={t('auth.password')}
      />
      {error ? (
        <Text style={{ color: c.danger, textAlign: 'center' }} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Button
        title={loading ? t('common.loading') : t('auth.signInBtn')}
        onPress={submit}
        loading={loading}
        testID="signin-submit"
      />
      <View style={styles.linkRow}>
        <Text
          style={[styles.link, { color: c.brand }]}
          onPress={() => router.push('/forgot-password')}
          accessibilityRole="button"
        >
          {t('auth.forgotLink')}
        </Text>
        <Text
          style={[styles.link, { color: c.brand }]}
          onPress={() => router.push('/sign-up')}
          accessibilityRole="button"
        >
          {t('auth.signUpLink')}
        </Text>
      </View>
      <SocialAuth onSuccess={() => router.replace('/')} />
      <Text
        style={[styles.link, { color: c.brand, textAlign: 'center' }]}
        onPress={() => router.replace('/')}
        accessibilityRole="button"
      >
        {t('common.back')}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', gap: 12 },
  heading: { fontSize: 28, fontWeight: '800', textAlign: 'center' },
  tagline: { textAlign: 'center', marginBottom: 16 },
  linkRow: { flexDirection: 'row', justifyContent: 'space-between' },
  link: { marginTop: 8, fontWeight: '600' },
});
