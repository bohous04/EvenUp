import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';

export default function TabsLayout() {
  const { t } = useI18n();
  const c = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: c.brand },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: c.brand,
        tabBarInactiveTintColor: c.textMuted,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('nav.groups'),
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: t('nav.activity'),
          tabBarIcon: ({ color, size }) => <Ionicons name="pulse-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('nav.settings'),
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
