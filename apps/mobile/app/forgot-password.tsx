import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { authClient } from '@/lib/auth';
import { apiUrl } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { theme } from '@/theme';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    setLoading(true);
    // The reset link opens the web app's /reset-password page — the reset
    // itself completes in the browser; the mobile app has no reset-token
    // screen of its own.
    await authClient.requestPasswordReset({ email, redirectTo: `${apiUrl}/reset-password` });
    setLoading(false);
    // Always show the same message, regardless of outcome, so we never
    // reveal whether an account exists for this email.
    setSent(true);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{t('auth.forgotTitle')}</Text>
      {sent ? (
        <Text style={styles.info}>{t('auth.forgotSent')}</Text>
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
            accessibilityLabel={t('auth.email')}
          />
          <Pressable
            style={styles.button}
            onPress={submit}
            disabled={loading}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>
              {loading ? t('common.loading') : t('auth.forgotBtn')}
            </Text>
          </Pressable>
        </>
      )}
      <Pressable onPress={() => router.replace('/sign-in')} accessibilityRole="button">
        <Text style={styles.link}>{t('common.back')}</Text>
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
  info: { textAlign: 'center', color: theme.text },
  link: { textAlign: 'center', color: theme.brand, marginTop: 8 },
});
