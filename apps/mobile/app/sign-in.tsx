import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    // The magic link opens back into the app via the `evenup://` scheme.
    const res = await signIn.magicLink({ email, callbackURL: 'evenup://' });
    setLoading(false);
    if (!res.error) setSent(true);
  }

  const [appleAvailable, setAppleAvailable] = useState(false);
  const [appleError, setAppleError] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    void AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  async function onApple() {
    setAppleError(null);
    try {
      const { ok, canceled } = await signInWithApple();
      if (ok) router.replace('/');
      else if (!canceled) setAppleError(t('error.generic'));
    } catch {
      setAppleError(t('error.generic'));
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{t('app.name')}</Text>
      <Text style={styles.tagline}>{t('app.tagline')}</Text>
      {sent ? (
        <View style={styles.infoRow}>
          <Ionicons name="mail-outline" size={18} color={theme.text} />
          <Text style={styles.info}>Check your inbox to finish signing in.</Text>
        </View>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            accessibilityLabel="Email"
          />
          <Pressable
            style={styles.button}
            onPress={submit}
            disabled={loading}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>
              {loading ? t('common.loading') : 'Sign in with email'}
            </Text>
          </Pressable>
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
        </>
      )}
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
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  info: { textAlign: 'center', color: theme.text },
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
