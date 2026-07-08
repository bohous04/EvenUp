import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import { signIn } from '@/lib/auth';
import { signInWithApple } from '@/lib/apple-sign-in';
import { useI18n } from '@/lib/i18n';
import { theme } from '@/theme';

export default function SignInScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    } else {
      router.replace('/');
    }
  }

  const [appleAvailable, setAppleAvailable] = useState(false);
  const [appleError, setAppleError] = useState<string | null>(null);
  const appleBusy = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    void AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  async function onApple() {
    // A ref, not state: a double-tap lands before React re-renders, and
    // AppleAuthenticationButton has no `disabled` prop to lean on.
    if (appleBusy.current) return;
    appleBusy.current = true;
    setAppleError(null);
    try {
      const { ok, canceled } = await signInWithApple();
      if (ok) router.replace('/');
      else if (!canceled) setAppleError(t('error.generic'));
    } catch {
      setAppleError(t('error.generic'));
    } finally {
      appleBusy.current = false;
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{t('app.name')}</Text>
      <Text style={styles.tagline}>{t('app.tagline')}</Text>
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
        autoComplete="current-password"
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
        <Text style={styles.buttonText}>{loading ? t('common.loading') : t('auth.signInBtn')}</Text>
      </Pressable>
      <View style={styles.linkRow}>
        <Pressable onPress={() => router.push('/forgot-password')} accessibilityRole="button">
          <Text style={styles.link}>{t('auth.forgotLink')}</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/sign-up')} accessibilityRole="button">
          <Text style={styles.link}>{t('auth.signUpLink')}</Text>
        </Pressable>
      </View>
      {appleAvailable ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={theme.radius}
          style={styles.appleButton}
          onPress={onApple}
        />
      ) : null}
      {appleError ? <Text style={styles.error}>{appleError}</Text> : null}
      <Pressable onPress={() => router.replace('/')} accessibilityRole="button">
        <Text style={styles.link}>{t('common.back')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', gap: 12, backgroundColor: theme.bg },
  heading: { fontSize: 28, fontWeight: '800', textAlign: 'center', color: theme.text },
  tagline: { textAlign: 'center', color: theme.textMuted, marginBottom: 16 },
  linkRow: { flexDirection: 'row', justifyContent: 'space-between' },
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
  appleButton: { height: 48, width: '100%' },
  error: { textAlign: 'center', color: '#b91c1c' },
  link: { textAlign: 'center', color: theme.brand, marginTop: 8 },
});
