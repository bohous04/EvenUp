import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Ionicons } from '@expo/vector-icons';
import { authClient } from '@/lib/auth';
import { signInWithApple } from '@/lib/apple-sign-in';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';

// Self-hosters without Google credentials shouldn't see a dead button; the web
// client gates on NEXT_PUBLIC_GOOGLE_ENABLED, mobile on the EXPO_PUBLIC_ mirror.
const googleEnabled = process.env.EXPO_PUBLIC_GOOGLE_ENABLED === 'true';

/**
 * Shared "continue with…" providers for sign-in and sign-up. Apple uses the
 * native sheet (iOS only, when available); Google opens the OAuth browser flow
 * handled by the Better Auth Expo client. On success it calls `onSuccess`.
 */
export function SocialAuth({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useI18n();
  const c = useTheme();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    void AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  async function onApple() {
    // A ref, not state: a double-tap lands before React re-renders, and
    // AppleAuthenticationButton has no `disabled` prop to lean on.
    if (busy.current) return;
    busy.current = true;
    setError(null);
    try {
      const { ok, canceled } = await signInWithApple();
      if (ok) onSuccess();
      else if (!canceled) setError(t('error.generic'));
    } catch {
      setError(t('error.generic'));
    } finally {
      busy.current = false;
    }
  }

  async function onGoogle() {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    try {
      const res = await authClient.signIn.social({ provider: 'google', callbackURL: '/' });
      if (res.error) setError(t('error.generic'));
      else onSuccess();
    } catch {
      setError(t('error.generic'));
    } finally {
      busy.current = false;
    }
  }

  if (!googleEnabled && !appleAvailable) return null;

  return (
    <View style={{ gap: 12 }} testID="social-auth">
      <View style={styles.dividerRow}>
        <View style={[styles.line, { backgroundColor: c.border }]} />
        <Text style={{ color: c.textMuted, fontSize: 12 }}>{t('common.or')}</Text>
        <View style={[styles.line, { backgroundColor: c.border }]} />
      </View>

      {googleEnabled ? (
        <Pressable
          onPress={onGoogle}
          accessibilityRole="button"
          testID="google-signin"
          style={[styles.googleBtn, { borderColor: c.border, backgroundColor: c.card }]}
        >
          <Ionicons name="logo-google" size={18} color={c.text} />
          <Text style={{ color: c.text, fontWeight: '600' }}>{t('auth.continueGoogle')}</Text>
        </Pressable>
      ) : null}

      {appleAvailable ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={c.radius}
          style={styles.appleButton}
          onPress={onApple}
        />
      ) : null}

      {error ? (
        <Text style={{ color: c.danger, textAlign: 'center' }} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  line: { height: 1, flex: 1 },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  appleButton: { height: 48, width: '100%' },
});
