import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { trpc } from '@/lib/trpc';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { Button, BottomSheet, Input, SegmentedControl } from '@/ui';
import { MemberChip } from '@/components/MemberChip';

type Role = 'ADMIN' | 'MEMBER';
interface EditState {
  id: string;
  displayName: string;
  defaultShare: string;
  role: Role;
  isActive: boolean;
}

/** Roster with per-member edit: rename, default share, role, deactivate/remove (FR-2.4/2.6). */
export function MemberList({ groupId }: { groupId: string }) {
  const { t } = useI18n();
  const c = useTheme();
  const utils = trpc.useUtils();
  const members = trpc.member.list.useQuery({ groupId });
  const [edit, setEdit] = useState<EditState | null>(null);

  const invalidate = () => {
    void utils.member.list.invalidate({ groupId });
    void utils.group.get.invalidate({ groupId });
    void utils.balance.get.invalidate({ groupId });
  };
  const update = trpc.member.update.useMutation({
    onSuccess: () => {
      invalidate();
      setEdit(null);
    },
  });
  const remove = trpc.member.remove.useMutation({
    onSuccess: () => {
      invalidate();
      setEdit(null);
    },
  });

  const rows = members.data ?? [];

  return (
    <View>
      {rows.map((m, i) => (
        <Pressable
          key={m.id}
          onPress={() =>
            setEdit({
              id: m.id,
              displayName: m.displayName,
              defaultShare: String(m.defaultShare),
              role: m.role as Role,
              isActive: m.isActive,
            })
          }
          accessibilityRole="button"
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: c.spacing[3],
            paddingVertical: c.spacing[2],
            paddingHorizontal: c.spacing[1],
            borderRadius: c.radii.lg,
            backgroundColor: pressed ? c.rowPressed : 'transparent',
            borderBottomWidth: i === rows.length - 1 ? 0 : c.control.hairline,
            borderBottomColor: c.divider,
          })}
        >
          <MemberChip initials={m.initials} color={m.color} name={m.displayName} size="sm" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{
                color: m.isActive ? c.text : c.textMuted,
                fontSize: c.type.bodySemibold.fontSize,
                fontWeight: c.type.bodySemibold.fontWeight,
              }}
            >
              {m.displayName}
              {!m.isActive ? ` · ${t('group.archived')}` : ''}
            </Text>
            <Text
              numberOfLines={1}
              style={{ color: c.textMuted, fontSize: c.type.meta.fontSize }}
            >
              {m.role === 'ADMIN' ? t('member.role.admin') : t('member.role.member')}
              {m.userId ? ` · ${t('member.connected')}` : ` · ${t('member.notConnected')}`}
            </Text>
          </View>
        </Pressable>
      ))}

      <BottomSheet
        visible={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.displayName}
        closeLabel={t('receipt.close')}
      >
        {edit ? (
          <View style={{ gap: c.spacing[3] }}>
            <Input
              label={t('member.name')}
              value={edit.displayName}
              onChangeText={(v) => setEdit({ ...edit, displayName: v })}
            />
            <Input
              label={t('member.defaultShare')}
              keyboardType="number-pad"
              value={edit.defaultShare}
              onChangeText={(v) => setEdit({ ...edit, defaultShare: v })}
            />
            <SegmentedControl<Role>
              options={[
                { value: 'MEMBER', label: t('member.role.member') },
                { value: 'ADMIN', label: t('member.role.admin') },
              ]}
              value={edit.role}
              onChange={(role) => setEdit({ ...edit, role })}
            />
            <Button
              title={t('common.save')}
              loading={update.isPending}
              onPress={() =>
                update.mutate({
                  memberId: edit.id,
                  displayName: edit.displayName.trim() || undefined,
                  defaultShare: Math.max(1, Math.min(1000, parseInt(edit.defaultShare, 10) || 1)),
                  role: edit.role,
                })
              }
            />
            {edit.isActive ? (
              <Button
                title={t('member.deactivate')}
                variant="secondary"
                onPress={() => update.mutate({ memberId: edit.id, isActive: false })}
              />
            ) : (
              <Button
                title={t('common.add')}
                variant="secondary"
                onPress={() => update.mutate({ memberId: edit.id, isActive: true })}
              />
            )}
            <Button
              title={t('common.delete')}
              variant="danger"
              loading={remove.isPending}
              onPress={() => remove.mutate({ memberId: edit.id })}
            />
          </View>
        ) : null}
      </BottomSheet>
    </View>
  );
}
