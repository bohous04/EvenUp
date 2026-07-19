import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { signUp } from '@/lib/auth';
import { SocialAuth } from '@/components/SocialAuth';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { Button, Input, Screen } from '@/ui';

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

  if (sent) {
    return (
      <Screen padded={false} style={styles.container}>
        <Text style={[styles.heading, { color: c.text }]}>{t('auth.signUpTitle')}</Text>
        <Text style={{ color: c.text, textAlign: 'center' }} testID="signup-verify-sent">
          {t('auth.verifySent')}
        </Text>
        <Button
          title={t('auth.resend')}
          variant="ghost"
          onPress={() => router.push({ pathname: '/verify-email', params: { email } })}
        />
        <Button
          title={t('auth.haveAccount')}
          variant="ghost"
          onPress={() => router.replace('/sign-in')}
        />
      </Screen>
    );
  }

  return (
    <Screen padded={false} style={styles.container}>
      <Text style={[styles.heading, { color: c.text }]}>{t('auth.signUpTitle')}</Text>
      <Input
        placeholder={t('auth.name')}
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
      <Input
        placeholder={t('auth.password')}
        autoCapitalize="none"
        autoComplete="new-password"
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
        title={loading ? t('common.loading') : t('auth.signUpBtn')}
        onPress={submit}
        loading={loading}
        testID="signup-submit"
      />
      <SocialAuth onSuccess={() => router.replace('/')} />
      <Text
        style={[styles.link, { color: c.brand }]}
        onPress={() => router.replace('/sign-in')}
        accessibilityRole="button"
      >
        {t('auth.haveAccount')}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', gap: 12 },
  heading: { fontSize: 28, fontWeight: '800', textAlign: 'center' },
  link: { textAlign: 'center', marginTop: 8, fontWeight: '600' },
});
