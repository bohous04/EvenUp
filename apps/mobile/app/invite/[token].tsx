import { Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Screen, Card } from '@/ui';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';

// Deep-link target for evenup://invite/<token>. The invite.preview/claim wiring
// lands in E1; this route proves the link resolves and surfaces the token.
export default function InviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { t } = useI18n();
  const c = useTheme();
  return (
    <Screen>
      <Card>
        <Text style={{ color: c.text, fontWeight: '700', fontSize: 16 }}>{t('invite.claim')}</Text>
        <Text style={{ color: c.textMuted }} testID="invite-token">
          {String(token)}
        </Text>
      </Card>
    </Screen>
  );
}
