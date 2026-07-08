import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Providers } from '@/providers';
import { theme } from '@/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Providers>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.brand },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '700' },
            contentStyle: { backgroundColor: theme.bg },
          }}
        >
          <Stack.Screen name="index" options={{ title: 'EvenUp' }} />
          <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
          <Stack.Screen name="group/[id]" options={{ title: 'Group' }} />
          <Stack.Screen name="scan" options={{ title: 'Scan receipt', presentation: 'modal' }} />
        </Stack>
      </Providers>
    </SafeAreaProvider>
  );
}
