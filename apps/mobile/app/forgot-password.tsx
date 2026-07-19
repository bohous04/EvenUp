import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { authClient } from '@/lib/auth';
import { apiUrl } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { Button, Input, Screen } from '@/ui';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const c = useTheme();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    setLoading(true);
    // The reset link opens the web app's /reset-password page (or the native
    // reset screen via universal link); the mobile app always shows the same
    // confirmation regardless of outcome, so we never reveal whether an account
    // exists for this email.
    await authClient.requestPasswordReset({ email, redirectTo: `${apiUrl}/reset-password` });
    setLoading(false);
    setSent(true);
  }

  return (
    <Screen padded={false} style={styles.container}>
      <Text style={[styles.heading, { color: c.text }]}>{t('auth.forgotTitle')}</Text>
      {sent ? (
        <Text style={{ color: c.text, textAlign: 'center' }}>{t('auth.forgotSent')}</Text>
      ) : (
        <>
          <Input
            placeholder="you@example.com"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            label={t('auth.email')}
          />
          <Button
            title={loading ? t('common.loading') : t('auth.forgotBtn')}
            onPress={submit}
            loading={loading}
          />
        </>
      )}
      <Text
        style={[styles.link, { color: c.brand }]}
        onPress={() => router.replace('/sign-in')}
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
  link: { textAlign: 'center', marginTop: 8, fontWeight: '600' },
});
