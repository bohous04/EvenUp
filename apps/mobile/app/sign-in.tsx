import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { authClient, signIn } from '@/lib/auth';
import { SocialAuth } from '@/components/SocialAuth';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import {
  Button,
  Card,
  Checkbox,
  ErrorText,
  Input,
  PasswordInput,
  Screen,
  Title,
  Wordmark,
} from '@/ui';

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
      <Screen scroll padded style={styles.centered}>
        <View style={styles.brand}>
          <Wordmark />
        </View>
        <Card>
          <Title>{useBackup ? t('security.2fa.backupTitle') : t('security.2fa.title')}</Title>
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
            <Checkbox
              label={t('security.2fa.trustDevice')}
              checked={trustDevice}
              onChange={setTrustDevice}
              testID="signin-2fa-trust"
            />
          ) : null}
          {error ? <ErrorText>{error}</ErrorText> : null}
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
        </Card>
      </Screen>
    );
  }

  return (
    <Screen scroll padded style={styles.centered}>
      {/* Web's `mb-6 text-center` branding block: two-tone wordmark + tagline. */}
      <View style={styles.brand}>
        <Wordmark />
        <Text style={[styles.tagline, { color: c.textMuted, fontSize: c.type.label.fontSize }]}>
          {t('app.tagline')}
        </Text>
      </View>

      <Card gap={16}>
        <Input
          placeholder="you@example.com"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          label={t('auth.email')}
        />
        <PasswordInput
          autoCapitalize="none"
          autoComplete="current-password"
          value={password}
          onChangeText={setPassword}
          label={t('auth.password')}
        />
        {error ? <ErrorText>{error}</ErrorText> : null}
        <Button
          title={loading ? t('common.loading') : t('auth.signInBtn')}
          onPress={submit}
          loading={loading}
          testID="signin-submit"
        />

        {/* Web stacks these on mobile widths (`flex-col`, spread only at `sm`+). */}
        <View style={{ gap: c.spacing[2] }}>
          <Text
            style={[styles.link, { color: c.brandText, fontSize: c.type.label.fontSize }]}
            onPress={() => router.push('/forgot-password')}
            accessibilityRole="button"
          >
            {t('auth.forgotLink')}
          </Text>
          <Text
            style={[styles.link, { color: c.brandText, fontSize: c.type.label.fontSize }]}
            onPress={() => router.push('/sign-up')}
            accessibilityRole="button"
          >
            {t('auth.signUpLink')}
          </Text>
        </View>

        <SocialAuth onSuccess={() => router.replace('/')} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // `flexGrow` (not `flex`) so the card centres on tall screens but the content
  // still scrolls once the keyboard is up.
  centered: { flexGrow: 1, justifyContent: 'center' },
  brand: { alignItems: 'center', gap: 4 },
  tagline: { textAlign: 'center' },
  link: { fontWeight: '500' },
});
