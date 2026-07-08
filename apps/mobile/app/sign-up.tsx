import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { signUp } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { theme } from '@/theme';

export default function SignUpScreen() {
  const router = useRouter();
  const { t } = useI18n();
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
    <View style={styles.container}>
      <Text style={styles.heading}>{t('auth.signUpTitle')}</Text>
      {sent ? (
        <Text style={styles.info}>{t('auth.verifySent')}</Text>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder={t('auth.name')}
            autoCapitalize="words"
            autoComplete="name"
            value={name}
            onChangeText={setName}
            accessibilityLabel={t('auth.name')}
          />
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            accessibilityLabel={t('auth.email')}
          />
          <TextInput
            style={styles.input}
            placeholder={t('auth.password')}
            autoCapitalize="none"
            autoComplete="new-password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            accessibilityLabel={t('auth.password')}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable
            style={styles.button}
            onPress={submit}
            disabled={loading}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>
              {loading ? t('common.loading') : t('auth.signUpBtn')}
            </Text>
          </Pressable>
        </>
      )}
      <Pressable onPress={() => router.replace('/sign-in')} accessibilityRole="button">
        <Text style={styles.link}>{t('auth.haveAccount')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', gap: 12, backgroundColor: theme.bg },
  heading: { fontSize: 28, fontWeight: '800', textAlign: 'center', color: theme.text },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
    borderRadius: theme.radius,
    padding: 14,
    fontSize: 16,
  },
  button: {
    backgroundColor: theme.brand,
    borderRadius: theme.radius,
    padding: 14,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  error: { textAlign: 'center', color: '#b91c1c' },
  info: { textAlign: 'center', color: theme.text },
  link: { textAlign: 'center', color: theme.brand, marginTop: 8 },
});
