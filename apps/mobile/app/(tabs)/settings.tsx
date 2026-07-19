import { Text } from 'react-native';
import { Screen } from '@/ui';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';

// Placeholder — the full settings surface is built in E6.
export default function SettingsScreen() {
  const { t } = useI18n();
  const c = useTheme();
  return (
    <Screen>
      <Text style={{ color: c.textMuted }}>{t('nav.settings')}</Text>
    </Screen>
  );
}
