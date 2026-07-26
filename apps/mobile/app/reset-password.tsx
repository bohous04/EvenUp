import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { authClient } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { Button, Card, ErrorText, PasswordInput, Screen, Title } from '@/ui';

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
    <Screen scroll padded style={styles.centered}>
      {/* Web's reset-password leads with a `text-2xl` heading, not the wordmark. */}
      <View style={styles.brand}>
        <Title>{t('auth.resetTitle')}</Title>
      </View>

      <Card gap={16}>
        {done ? (
          <>
            <Text
              style={[styles.center, { color: c.textSecondary, fontSize: c.type.label.fontSize }]}
              testID="reset-done"
            >
              {t('auth.resetDone')}
            </Text>
            <Button title={t('auth.signInBtn')} onPress={() => router.replace('/sign-in')} />
          </>
        ) : (
          <>
            <PasswordInput
              label={t('auth.newPassword')}
              autoCapitalize="none"
              autoComplete="new-password"
              value={password}
              onChangeText={setPassword}
            />
            {error ? <ErrorText>{error}</ErrorText> : null}
            <Button
              title={loading ? t('common.loading') : t('auth.resetBtn')}
              onPress={submit}
              loading={loading}
              testID="reset-submit"
            />
          </>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // `flexGrow` (not `flex`) so the card centres on tall screens but the content
  // still scrolls once the keyboard is up.
  centered: { flexGrow: 1, justifyContent: 'center' },
  brand: { alignItems: 'center', gap: 4 },
  center: { textAlign: 'center' },
});
