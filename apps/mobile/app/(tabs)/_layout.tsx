import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { Wordmark } from '@/ui/Text';

export default function TabsLayout() {
  const { t } = useI18n();
  const c = useTheme();
  return (
    <Tabs
      screenOptions={{
        // Matches web's `bg-white/80 border-b border-zinc-200` header rather
        // than a brand-filled bar; the stack hairline stands in for the border.
        headerStyle: { backgroundColor: c.card },
        headerTintColor: c.text,
        // Web's header carries the wordmark on every page while the page itself
        // supplies the `h1`. Using the tab name here instead would print the
        // same word twice (header "Groups" over the page title "Groups").
        headerTitle: () => <Wordmark size="sm" />,
        // `brandText`, not `brand`: indigo-600 on a zinc-900 tab bar is too dark
        // to read, which is why web flips accents to brand-100 in dark mode.
        tabBarActiveTintColor: c.brandText,
        tabBarInactiveTintColor: c.textMuted,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('nav.groups'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: t('nav.activity'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="pulse-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('nav.settings'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
