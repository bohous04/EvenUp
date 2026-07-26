import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View, useColorScheme } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { authClient } from '@/lib/auth';
import { signInWithApple } from '@/lib/apple-sign-in';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { Button } from '@/ui/Button';
import { ErrorText } from '@/ui/Text';
import { GoogleLogo } from '@/ui/icons';

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
  const dark = useColorScheme() === 'dark';
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
        <Text style={{ color: c.textMuted, fontSize: c.type.caption.fontSize }}>
          {t('common.or')}
        </Text>
        <View style={[styles.line, { backgroundColor: c.border }]} />
      </View>

      {googleEnabled ? (
        <Button
          variant="secondary"
          onPress={onGoogle}
          testID="google-signin"
          title={t('auth.continueGoogle')}
          icon={<GoogleLogo size={18} />}
        />
      ) : null}

      {appleAvailable ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          // Apple's HIG requires the white mark on dark backgrounds — a black
          // button on `zinc-950` is all but invisible.
          buttonStyle={
            dark
              ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
          }
          cornerRadius={c.radii.lg}
          style={styles.appleButton}
          onPress={onApple}
        />
      ) : null}

      {error ? <ErrorText>{error}</ErrorText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  line: { height: 1, flex: 1 },
  appleButton: { height: 48, width: '100%' },
});
