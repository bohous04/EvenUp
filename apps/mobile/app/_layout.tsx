import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Providers } from '@/providers';
import { PushRegistrar } from '@/components/PushRegistrar';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';

/**
 * Lives *inside* `Providers` on purpose: `useTheme()`/`useI18n()` read context,
 * and `RootLayout` is the component that renders the provider. Reading them a
 * level up silently returned the light-mode default, which is why the nav
 * chrome used to stay light-coloured in dark mode.
 */
function ThemedStack() {
  const c = useTheme();
  const { t } = useI18n();

  return (
    <Stack
      screenOptions={{
        // Web's header is `bg-white/80` with a `border-b border-zinc-200` — not
        // a brand-coloured bar. The native stack's default hairline separator
        // stands in for that border, so it is left visible.
        headerStyle: { backgroundColor: c.card },
        headerTintColor: c.text,
        headerTitleStyle: {
          fontSize: c.type.sheetTitle.fontSize,
          fontWeight: c.type.sheetTitle.fontWeight,
          color: c.text,
        },
        contentStyle: { backgroundColor: c.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="sign-in" options={{ title: t('auth.signInBtn') }} />
      <Stack.Screen name="sign-up" options={{ title: t('auth.signUpBtn') }} />
      <Stack.Screen name="forgot-password" options={{ title: t('auth.forgotTitle') }} />
      <Stack.Screen name="verify-email" options={{ title: t('auth.verifyTitle') }} />
      <Stack.Screen name="reset-password" options={{ title: t('auth.resetTitle') }} />
      {/* The group screen overrides this with the group's own name. */}
      <Stack.Screen name="group/[id]" options={{ title: t('nav.groups') }} />
      <Stack.Screen name="scan" options={{ title: t('ocr.scan'), presentation: 'modal' }} />
      <Stack.Screen name="expense" options={{ title: t('expense.add'), presentation: 'modal' }} />
      <Stack.Screen name="admin" options={{ title: t('nav.admin') }} />
      <Stack.Screen name="invite/[token]" options={{ title: t('invite.claim'), presentation: 'modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Providers>
        <PushRegistrar />
        <StatusBar style="auto" />
        <ThemedStack />
      </Providers>
    </SafeAreaProvider>
  );
}
