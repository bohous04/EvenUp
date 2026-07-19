import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MEMBER_COLORS, deriveInitials } from '@evenup/core';
import { trpc } from '@/lib/trpc';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { Button, Input, SegmentedControl } from '@/ui';
import { MemberChip } from '@/components/MemberChip';

type Role = 'ADMIN' | 'MEMBER';

/** Add a virtual member with a name, color, default share, and role (FR-2.2/2.3/2.6). */
export function AddMemberForm({ groupId }: { groupId: string }) {
  const { t } = useI18n();
  const c = useTheme();
  const utils = trpc.useUtils();
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(MEMBER_COLORS[0]!);
  const [share, setShare] = useState('1');
  const [role, setRole] = useState<Role>('MEMBER');

  const add = trpc.member.add.useMutation({
    onSuccess: () => {
      setName('');
      setShare('1');
      setRole('MEMBER');
      void utils.group.get.invalidate({ groupId });
      void utils.member.list.invalidate({ groupId });
    },
  });

  const trimmed = name.trim();
  const shareNum = Math.max(1, Math.min(1000, parseInt(share || '1', 10) || 1));

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <MemberChip initials={trimmed ? deriveInitials(trimmed) : '?'} color={color} name={trimmed} />
        <View style={{ flex: 1 }}>
          <Input
            placeholder={t('member.name')}
            value={name}
            onChangeText={setName}
            label={t('member.name')}
            autoCapitalize="words"
            testID="member-name-input"
          />
        </View>
      </View>

      <Text style={{ color: c.textMuted, fontSize: 13 }}>{t('common.optional')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {MEMBER_COLORS.map((col) => (
          <Pressable
            key={col}
            onPress={() => setColor(col)}
            accessibilityRole="button"
            accessibilityState={{ selected: col === color }}
            accessibilityLabel={col}
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: col,
              borderWidth: col === color ? 3 : 0,
              borderColor: c.text,
            }}
          />
        ))}
      </View>

      <Input
        label={t('member.defaultShare')}
        keyboardType="number-pad"
        value={share}
        onChangeText={setShare}
      />

      <SegmentedControl<Role>
        options={[
          { value: 'MEMBER', label: t('member.role.member') },
          { value: 'ADMIN', label: t('member.role.admin') },
        ]}
        value={role}
        onChange={setRole}
      />

      <Button
        title={t('member.add')}
        onPress={() =>
          add.mutate({ groupId, displayName: trimmed, color, defaultShare: shareNum, role })
        }
        loading={add.isPending}
        disabled={!trimmed}
        testID="member-add-submit"
      />
    </View>
  );
}
