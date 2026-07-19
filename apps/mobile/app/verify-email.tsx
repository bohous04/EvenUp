import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { authClient } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { Button, Card, Screen } from '@/ui';

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
    <Screen>
      <Card>
        <Text style={{ color: c.text, fontWeight: '700', fontSize: 18 }}>
          {t('auth.verifyTitle')}
        </Text>
        <Text style={{ color: c.textMuted }}>
          {t('auth.verifyBody', { email: String(email ?? '') })}
        </Text>
        <Button
          title={status === 'sent' ? t('auth.resent') : t('auth.resend')}
          onPress={resend}
          loading={status === 'sending'}
          disabled={status === 'sent'}
          testID="verify-resend"
        />
      </Card>
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
  link: { textAlign: 'center', marginTop: 8, fontWeight: '600' },
});
