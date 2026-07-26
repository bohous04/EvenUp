import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { authClient } from '@/lib/auth';
import { apiUrl } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { Button, Card, Input, Screen, Title } from '@/ui';

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
    <Screen scroll padded style={styles.centered}>
      {/* Web's forgot-password leads with a `text-2xl` heading, not the wordmark. */}
      <View style={styles.brand}>
        <Title>{t('auth.forgotTitle')}</Title>
      </View>

      <Card gap={16}>
        {sent ? (
          <Text
            style={[styles.center, { color: c.textSecondary, fontSize: c.type.label.fontSize }]}
          >
            {t('auth.forgotSent')}
          </Text>
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
          style={[styles.link, { color: c.brandText, fontSize: c.type.label.fontSize }]}
          onPress={() => router.replace('/sign-in')}
          accessibilityRole="button"
        >
          {t('common.back')}
        </Text>
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
  link: { textAlign: 'center', fontWeight: '500' },
});
