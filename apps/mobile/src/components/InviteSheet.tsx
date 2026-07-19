import { useState } from 'react';
import { Share, Text, View } from 'react-native';
import { trpc } from '@/lib/trpc';
import { apiUrl } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { Button, BottomSheet } from '@/ui';

/** Create a tokenized invite link and hand it to the native share sheet (FR-2.5). */
export function InviteSheet({
  visible,
  onClose,
  groupId,
  groupName,
}: {
  visible: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
}) {
  const { t } = useI18n();
  const c = useTheme();
  const [url, setUrl] = useState<string | null>(null);

  const create = trpc.invite.create.useMutation({
    onSuccess: (invite) => setUrl(`${apiUrl}/invite/${invite.token}`),
  });

  async function share() {
    if (!url) return;
    // User dismissing the sheet rejects; nothing to handle.
    await Share.share({ message: url, url, title: groupName }).catch(() => {});
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={() => {
        setUrl(null);
        onClose();
      }}
      title={t('invite.create')}
    >
      <View style={{ gap: 12 }}>
        {url ? (
          <>
            <Text selectable style={{ color: c.text }} testID="invite-url">
              {url}
            </Text>
            <Button title={t('invite.share')} onPress={share} />
          </>
        ) : (
          <Button
            title={t('invite.create')}
            loading={create.isPending}
            onPress={() => create.mutate({ groupId })}
            testID="invite-create"
          />
        )}
      </View>
    </BottomSheet>
  );
}
