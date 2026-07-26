import { useState } from 'react';
import { Share, Text, View } from 'react-native';
import { trpc } from '@/lib/trpc';
import { apiUrl } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { Button, BottomSheet, Label } from '@/ui';

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
      closeLabel={t('receipt.close')}
    >
      <View style={{ gap: c.spacing[3] }}>
        {url ? (
          <>
            <View style={{ gap: c.spacing[1] }}>
              <Label>{t('invite.link')}</Label>
              {/* Web renders the token URL in a muted code block; the same
                  treatment keeps a long link from reading as body copy. */}
              <View
                style={{
                  backgroundColor: c.inputBg,
                  borderWidth: c.control.hairline,
                  borderColor: c.borderInput,
                  borderRadius: c.radii.lg,
                  padding: c.spacing[3],
                }}
              >
                <Text
                  selectable
                  style={{ color: c.textSecondary, fontSize: c.type.meta.fontSize }}
                  testID="invite-url"
                >
                  {url}
                </Text>
              </View>
            </View>
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
