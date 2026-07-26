import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { signUp } from '@/lib/auth';
import { SocialAuth } from '@/components/SocialAuth';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { Button, Card, ErrorText, Input, PasswordInput, Screen, Wordmark } from '@/ui';

export default function SignUpScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const c = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    setLoading(true);
    setError(null);
    const res = await signUp.email({ name, email, password });
    setLoading(false);
    if (res.error) {
      setError(
        res.error.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'
          ? t('auth.err.emailInUse')
          : t('error.generic'),
      );
    } else {
      setSent(true);
    }
  }

  return (
    <Screen scroll padded style={styles.centered}>
      {/* Web's `mb-6 text-center` branding block: two-tone wordmark + subtitle. */}
      <View style={styles.brand}>
        <Wordmark />
        <Text style={[styles.center, { color: c.textMuted, fontSize: c.type.label.fontSize }]}>
          {t('auth.signUpTitle')}
        </Text>
      </View>

      <Card gap={16}>
        {sent ? (
          <>
            <Text
              style={[styles.center, { color: c.textSecondary, fontSize: c.type.label.fontSize }]}
              testID="signup-verify-sent"
            >
              {t('auth.verifySent')}
            </Text>
            <View style={{ gap: c.spacing[2] }}>
              <Text
                style={[styles.link, { color: c.brandText, fontSize: c.type.label.fontSize }]}
                onPress={() => router.push({ pathname: '/verify-email', params: { email } })}
                accessibilityRole="button"
              >
                {t('auth.resend')}
              </Text>
              <Text
                style={[styles.link, { color: c.brandText, fontSize: c.type.label.fontSize }]}
                onPress={() => router.replace('/sign-in')}
                accessibilityRole="button"
              >
                {t('auth.haveAccount')}
              </Text>
            </View>
          </>
        ) : (
          <>
            <Input
              autoCapitalize="words"
              autoComplete="name"
              value={name}
              onChangeText={setName}
              label={t('auth.name')}
            />
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
              autoComplete="new-password"
              value={password}
              onChangeText={setPassword}
              label={t('auth.password')}
            />
            {error ? <ErrorText>{error}</ErrorText> : null}
            <Button
              title={loading ? t('common.loading') : t('auth.signUpBtn')}
              onPress={submit}
              loading={loading}
              testID="signup-submit"
            />

            <Text
              style={[styles.link, { color: c.brandText, fontSize: c.type.label.fontSize }]}
              onPress={() => router.replace('/sign-in')}
              accessibilityRole="button"
            >
              {t('auth.haveAccount')}
            </Text>

            {/* Web's sign-up is email-only; native keeps the providers so the
                Apple sign-in requirement is met from either entry point. */}
            <SocialAuth onSuccess={() => router.replace('/')} />
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
  link: { textAlign: 'center', fontWeight: '500' },
});
