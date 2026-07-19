import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { trpc } from '@/lib/trpc';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { Button, BottomSheet, Input } from '@/ui';

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

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('group.categories')}>
      <View style={{ gap: 10 }}>
        {(list.data ?? []).map((cat) => (
          <View
            key={cat.id}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Text style={{ color: c.text }}>{cat.name}</Text>
            <Pressable
              onPress={() => remove.mutate({ categoryId: cat.id })}
              accessibilityLabel={t('common.delete')}
              hitSlop={8}
            >
              <Ionicons name="trash-outline" size={18} color={c.textMuted} />
            </Pressable>
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <Input value={name} onChangeText={setName} placeholder={t('expense.category')} />
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
