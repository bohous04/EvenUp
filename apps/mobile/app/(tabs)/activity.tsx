import { Ionicons } from '@expo/vector-icons';
import { Card, EmptyState, Screen, Title } from '@/ui';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';

// Placeholder — the cross-group activity feed is built in E6. Until then this
// mirrors web's page shell: an `h1` over a `Card` wrapping the `EmptyState`.
export default function ActivityScreen() {
  const { t } = useI18n();
  const c = useTheme();
  return (
    <Screen>
      <Title>{t('nav.activity')}</Title>
      <Card>
        <EmptyState
          icon={<Ionicons name="pulse-outline" size={28} color={c.textFaint} />}
          title={t('activity.empty')}
        />
      </Card>
    </Screen>
  );
}
