import { useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { trpc } from '@/lib/trpc';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { Button, BottomSheet, EmptyState, IconButton, Input } from '@/ui';

/** Manage a group's custom expense categories (PRD §4.12). */
export function CategoryManagerSheet({
  visible,
  onClose,
  groupId,
}: {
  visible: boolean;
  onClose: () => void;
  groupId: string;
}) {
  const { t } = useI18n();
  const c = useTheme();
  const utils = trpc.useUtils();
  const list = trpc.category.list.useQuery({ groupId });
  const [name, setName] = useState('');

  const invalidate = () => void utils.category.list.invalidate({ groupId });
  const create = trpc.category.create.useMutation({
    onSuccess: () => {
      setName('');
      invalidate();
    },
  });
  const remove = trpc.category.remove.useMutation({ onSuccess: invalidate });

  const rows = list.data ?? [];

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('group.categories')}
      closeLabel={t('receipt.close')}
    >
      <View style={{ gap: c.spacing[3] }}>
        {rows.length === 0 ? (
          <EmptyState
            title={t('category.custom.empty')}
            icon={<Ionicons name="pricetags-outline" size={28} color={c.textFaint} />}
          />
        ) : (
          <View>
            {rows.map((cat, i) => (
              <View
                key={cat.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: c.spacing[3],
                  paddingVertical: c.spacing[1],
                  borderBottomWidth: i === rows.length - 1 ? 0 : c.control.hairline,
                  borderBottomColor: c.divider,
                }}
              >
                <Ionicons name="pricetag-outline" size={18} color={c.textFaint} />
                <Text
                  numberOfLines={1}
                  style={{ flex: 1, color: c.text, fontSize: c.type.body.fontSize }}
                >
                  {cat.name}
                </Text>
                <IconButton
                  icon="trash-outline"
                  size={18}
                  onPress={() => remove.mutate({ categoryId: cat.id })}
                  accessibilityLabel={t('common.delete')}
                />
              </View>
            ))}
          </View>
        )}

        <View
          style={{
            flexDirection: 'row',
            gap: c.spacing[2],
            alignItems: 'flex-end',
            borderTopWidth: c.control.hairline,
            borderTopColor: c.divider,
            paddingTop: c.spacing[4],
          }}
        >
          <View style={{ flex: 1 }}>
            <Input
              label={t('category.custom.name')}
              value={name}
              onChangeText={setName}
              placeholder={t('expense.category')}
            />
          </View>
          <Button
            title={t('common.add')}
            loading={create.isPending}
            disabled={!name.trim()}
            onPress={() => create.mutate({ groupId, name: name.trim(), iconName: 'package' })}
          />
        </View>
      </View>
    </BottomSheet>
  );
}
