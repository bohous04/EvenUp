import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { trpc } from '@/lib/trpc';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { Button, Card, Checkbox, EmptyState, Input, Screen, SectionLabel, Title } from '@/ui';

/**
 * Instance admin dashboard: the shared OCR key + model, and each user's
 * VIP / admin / disabled state (spec 2026-07-08).
 */
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
      <InstanceKeyCard />

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

/**
 * The shared OpenRouter key and OCR model, mirroring web's `InstanceConfigCard`.
 *
 * This is the *instance* key — there is no per-user key any more (migration
 * `drop_user_byo_key`), which is why it lives behind the admin screen rather
 * than in settings.
 *
 * Web shows the key field only while no key is set, and swaps it for a
 * status + delete row once one is; that carries over, since the key is
 * write-only (the server never returns it, only `hasKey`) and a masked input
 * you cannot read back is just a dead control.
 */
function InstanceKeyCard() {
  const { t } = useI18n();
  const c = useTheme();
  const utils = trpc.useUtils();
  const cfg = trpc.admin.getInstanceConfig.useQuery();
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState<string | null>(null);

  const invalidate = () => void utils.admin.getInstanceConfig.invalidate();
  const setKey = trpc.admin.setInstanceOpenRouterKey.useMutation({
    onSuccess: () => {
      setApiKey('');
      invalidate();
    },
  });
  const clearKey = trpc.admin.clearInstanceOpenRouterKey.useMutation({ onSuccess: invalidate });
  const setOcr = trpc.admin.setInstanceOcrModel.useMutation({ onSuccess: invalidate });

  // `null` means untouched — fall back to the server value so the field is not
  // blanked while the query resolves.
  const modelValue = model ?? cfg.data?.ocrModel ?? '';

  return (
    <Card>
      <SectionLabel>{t('admin.instanceKey')}</SectionLabel>
      <Text style={{ color: c.textMuted, fontSize: c.type.meta.fontSize }}>
        {t('admin.instanceKey.desc')}
      </Text>

      {cfg.data?.hasKey ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: c.spacing[3] }}>
          <Text style={{ flex: 1, color: c.green, fontSize: c.type.body.fontSize }}>
            {t('common.confirm')}
          </Text>
          <Button
            title={t('common.delete')}
            variant="danger"
            onPress={() => clearKey.mutate()}
            loading={clearKey.isPending}
            testID="instance-key-clear"
          />
        </View>
      ) : (
        <>
          <Input
            label={t('settings.apiKey')}
            value={apiKey}
            onChangeText={setApiKey}
            placeholder="sk-or-v1-…"
            autoCapitalize="none"
            secureTextEntry
            testID="instance-key-input"
          />
          <Button
            title={t('common.save')}
            onPress={() => setKey.mutate({ apiKey: apiKey.trim() })}
            loading={setKey.isPending}
            disabled={apiKey.trim().length === 0}
            testID="instance-key-save"
          />
        </>
      )}

      <Input
        label={t('admin.ocrModel')}
        value={modelValue}
        onChangeText={setModel}
        placeholder="google/gemini-2.5-flash"
        autoCapitalize="none"
        testID="instance-ocr-model"
      />
      <Button
        title={t('common.save')}
        variant="secondary"
        onPress={() => setOcr.mutate({ model: modelValue.trim() })}
        loading={setOcr.isPending}
      />
    </Card>
  );
}
