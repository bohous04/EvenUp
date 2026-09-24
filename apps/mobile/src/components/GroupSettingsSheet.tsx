import { useState } from 'react';
import { Text, View } from 'react-native';
import { trpc } from '@/lib/trpc';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { Button, BottomSheet, Checkbox, Input } from '@/ui';

/** Group settings: rename, simplify-debts toggle, FX lock, archive (FR-2.7/2.8/8.3). */
export function GroupSettingsSheet({
  visible,
  onClose,
  groupId,
  name,
  simplifyDebts,
  archived,
  baseCurrency,
  fxLockedRate,
}: {
  visible: boolean;
  onClose: () => void;
  groupId: string;
  name: string;
  simplifyDebts: boolean;
  archived: boolean;
  /** Group base currency — the quote side of the lock, shown in the hint. */
  baseCurrency: string;
  /** The locked rate as stored (a decimal string), or null when unlocked. */
  fxLockedRate: string | null;
}) {
  const { t } = useI18n();
  const c = useTheme();
  const utils = trpc.useUtils();
  const [draftName, setDraftName] = useState(name);
  const [draftRate, setDraftRate] = useState('');

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

  // The API validates the decimal; here we only avoid firing a request for an
  // empty or already-locked value.
  const rateToLock = draftRate.trim().replace(',', '.');
  const canLock = /^\d+(\.\d+)?$/.test(rateToLock) && Number(rateToLock) > 0;

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

        <View style={{ gap: c.spacing[2] }}>
          <Text style={{ fontWeight: '600' }}>{t('group.fxLockTitle')}</Text>
          <Text style={{ opacity: 0.7, fontSize: 13 }}>{t('group.fxLockHint')}</Text>
          {fxLockedRate ? (
            <View style={{ flexDirection: 'row', gap: c.spacing[2], alignItems: 'center' }}>
              <Text testID="fx-locked-rate">{t('group.fxLocked', { rate: fxLockedRate })}</Text>
              <Button
                testID="fx-unlock"
                title={t('group.fxUnlock')}
                variant="secondary"
                loading={update.isPending}
                onPress={() => update.mutate({ groupId, fxLockedRate: null })}
              />
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: c.spacing[2], alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}>
                <Input
                  testID="fx-lock-input"
                  label={t('group.fxLockRate', { quote: '?', base: baseCurrency })}
                  value={draftRate}
                  onChangeText={setDraftRate}
                  keyboardType="decimal-pad"
                />
              </View>
              <Button
                testID="fx-lock-submit"
                title={t('group.fxLockSubmit')}
                loading={update.isPending}
                disabled={!canLock}
                onPress={() => update.mutate({ groupId, fxLockedRate: rateToLock })}
              />
            </View>
          )}
        </View>

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
