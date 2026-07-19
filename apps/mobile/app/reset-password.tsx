import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { authClient } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { Button, Input, Screen } from '@/ui';

// Native target for a password-reset deep link (evenup://reset-password?token=…).
// Universal-link wiring of the reset email into the app is set up in E8; this
// screen makes the in-app reset work once the link resolves here.
export default function ResetPasswordScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const c = useTheme();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    if (!token) {
      setError(t('auth.err.resetToken'));
      return;
    }
    setLoading(true);
    setError(null);
    const res = await authClient.resetPassword({ newPassword: password, token: String(token) });
    setLoading(false);
    if (res.error) setError(t('auth.err.resetToken'));
    else setDone(true);
  }

  return (
    <Screen padded={false} style={styles.container}>
      <Text style={[styles.heading, { color: c.text }]}>{t('auth.resetTitle')}</Text>
      {done ? (
        <>
          <Text style={{ color: c.text, textAlign: 'center' }} testID="reset-done">
            {t('auth.resetDone')}
          </Text>
          <Button title={t('auth.signInBtn')} onPress={() => router.replace('/sign-in')} />
        </>
      ) : (
        <>
          <Input
            label={t('auth.newPassword')}
            placeholder={t('auth.newPassword')}
            autoCapitalize="none"
            autoComplete="new-password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          {error ? (
            <Text style={{ color: c.danger, textAlign: 'center' }} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button
            title={loading ? t('common.loading') : t('auth.resetBtn')}
            onPress={submit}
            loading={loading}
            testID="reset-submit"
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', gap: 12 },
  heading: { fontSize: 28, fontWeight: '800', textAlign: 'center' },
});
