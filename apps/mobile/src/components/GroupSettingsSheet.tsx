import { useState } from 'react';
import { View } from 'react-native';
import { trpc } from '@/lib/trpc';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { Button, BottomSheet, Checkbox, Input } from '@/ui';

/** Group settings: rename, simplify-debts toggle, archive/restore (FR-2.7/2.8). */
export function GroupSettingsSheet({
  visible,
  onClose,
  groupId,
  name,
  simplifyDebts,
  archived,
}: {
  visible: boolean;
  onClose: () => void;
  groupId: string;
  name: string;
  simplifyDebts: boolean;
  archived: boolean;
}) {
  const { t } = useI18n();
  const c = useTheme();
  const utils = trpc.useUtils();
  const [draftName, setDraftName] = useState(name);

  const invalidate = () => {
    void utils.group.get.invalidate({ groupId });
    void utils.group.list.invalidate();
    void utils.balance.get.invalidate({ groupId });
  };
  const update = trpc.group.update.useMutation({ onSuccess: invalidate });
  const archive = trpc.group.archive.useMutation({
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('group.menu')}
      closeLabel={t('receipt.close')}
    >
      <View style={{ gap: c.spacing[4] }}>
        <View style={{ flexDirection: 'row', gap: c.spacing[2], alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <Input label={t('group.name')} value={draftName} onChangeText={setDraftName} />
          </View>
          <Button
            title={t('common.save')}
            loading={update.isPending}
            disabled={!draftName.trim() || draftName.trim() === name}
            onPress={() => update.mutate({ groupId, name: draftName.trim() })}
          />
        </View>

        <Checkbox
          label={t('group.simplifyDebts')}
          checked={simplifyDebts}
          onChange={(next) => update.mutate({ groupId, simplifyDebts: next })}
        />

        <Button
          title={archived ? t('group.restore') : t('group.archive')}
          variant={archived ? 'secondary' : 'danger'}
          loading={archive.isPending}
          onPress={() => archive.mutate({ groupId, archived: !archived })}
        />
      </View>
    </BottomSheet>
  );
}
