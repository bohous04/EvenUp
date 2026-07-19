import { Text } from 'react-native';
import { Screen } from '@/ui';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';

// Placeholder — the cross-group activity feed is built in E6.
export default function ActivityScreen() {
  const { t } = useI18n();
  const c = useTheme();
  return (
    <Screen>
      <Text style={{ color: c.textMuted }}>{t('activity.empty')}</Text>
    </Screen>
  );
}
