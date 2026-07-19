import { ActivityIndicator, Text, View } from 'react-native';
import { trpc } from '@/lib/trpc';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { Button, Card, Screen } from '@/ui';

/** Instance admin dashboard: manage users' VIP / admin / disabled state (spec 2026-07-08). */
export default function AdminScreen() {
  const { t } = useI18n();
  const c = useTheme();
  const utils = trpc.useUtils();
  const users = trpc.admin.listUsers.useQuery({});

  const invalidate = () => void utils.admin.listUsers.invalidate();
  const setVip = trpc.admin.setVip.useMutation({ onSuccess: invalidate });
  const setAdmin = trpc.admin.setAdmin.useMutation({ onSuccess: invalidate });
  const setDisabled = trpc.admin.setDisabled.useMutation({ onSuccess: invalidate });

  if (users.isLoading) {
    return (
      <Screen>
        <ActivityIndicator color={c.brand} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Text style={{ color: c.text, fontWeight: '800', fontSize: 20 }}>{t('admin.users')}</Text>
      {(users.data?.users ?? []).map((u) => (
        <Card key={u.id}>
          <Text style={{ color: c.text, fontWeight: '600' }}>{u.name ?? u.email}</Text>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>{u.email}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            <Button
              title={`${t('admin.col.vip')}: ${u.isVip ? t('security.2fa.on') : t('security.2fa.off')}`}
              variant="secondary"
              onPress={() => setVip.mutate({ userId: u.id, isVip: !u.isVip })}
            />
            <Button
              title={`${t('admin.col.admin')}: ${u.isAdmin ? t('security.2fa.on') : t('security.2fa.off')}`}
              variant="secondary"
              onPress={() => setAdmin.mutate({ userId: u.id, isAdmin: !u.isAdmin })}
            />
            <Button
              title={u.disabledAt ? t('group.restore') : t('admin.col.disabled')}
              variant={u.disabledAt ? 'secondary' : 'danger'}
              onPress={() => setDisabled.mutate({ userId: u.id, disabled: !u.disabledAt })}
            />
          </View>
        </Card>
      ))}
    </Screen>
  );
}
