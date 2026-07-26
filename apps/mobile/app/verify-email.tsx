import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { authClient } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { Button, Card, Screen, Title } from '@/ui';

// Post-sign-up pending screen: mirrors web /verify-email/pending. The account
// exists but is unverified; the link in the email completes verification.
export default function VerifyEmailScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const c = useTheme();
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');

  async function resend() {
    if (!email) return;
    setStatus('sending');
    await authClient
      .sendVerificationEmail({ email: String(email), callbackURL: '/' })
      .catch(() => {});
    setStatus('sent');
  }

  return (
    <Screen scroll padded style={styles.centered}>
      {/* Web's pending page leads with a `text-2xl` heading, not the wordmark. */}
      <View style={styles.brand}>
        <Title>{t('auth.verifyTitle')}</Title>
      </View>

      <Card gap={16}>
        <Text style={[styles.center, { color: c.textSecondary, fontSize: c.type.label.fontSize }]}>
          {t('auth.verifyBody', { email: String(email ?? '') })}
        </Text>
        <Button
          title={status === 'sent' ? t('auth.resent') : t('auth.resend')}
          variant="secondary"
          onPress={resend}
          loading={status === 'sending'}
          disabled={status === 'sent'}
          testID="verify-resend"
        />
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
