import { ActivityIndicator, Text, View } from 'react-native';
import { trpc } from '@/lib/trpc';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { Button, Card, Checkbox, EmptyState, Screen, Title } from '@/ui';

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
      <Title>{t('admin.users')}</Title>
      {(users.data?.users ?? []).length === 0 ? (
        <Card>
          <EmptyState title={t('admin.users')} />
        </Card>
      ) : null}
      {(users.data?.users ?? []).map((u) => (
        <Card key={u.id}>
          <View>
            <Text
              style={{
                color: c.text,
                fontSize: c.type.bodySemibold.fontSize,
                fontWeight: c.type.bodySemibold.fontWeight,
              }}
            >
              {u.name ?? u.email}
            </Text>
            <Text style={{ color: c.textMuted, fontSize: c.type.meta.fontSize }}>{u.email}</Text>
          </View>
          {/* Toggles, so they read as state rather than as three competing actions. */}
          <Checkbox
            label={t('admin.col.vip')}
            checked={u.isVip}
            onChange={(next) => setVip.mutate({ userId: u.id, isVip: next })}
          />
          <Checkbox
            label={t('admin.col.admin')}
            checked={u.isAdmin}
            onChange={(next) => setAdmin.mutate({ userId: u.id, isAdmin: next })}
          />
          <Button
            title={u.disabledAt ? t('group.restore') : t('admin.col.disabled')}
            variant={u.disabledAt ? 'secondary' : 'danger'}
            onPress={() => setDisabled.mutate({ userId: u.id, disabled: !u.disabledAt })}
          />
        </Card>
      ))}
    </Screen>
  );
}
