import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSession } from '@/lib/auth';
import { trpc } from '@/lib/trpc';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { Button, Card, ErrorText, Screen, SectionLabel, Title, Wordmark } from '@/ui';
import { MemberChip } from '@/components/MemberChip';

// Deep-link target for evenup://invite/<token>. Preview is public so a
// participant sees the group before signing in; claiming needs a session.
export default function InviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const c = useTheme();
  const { data: session } = useSession();

  const preview = trpc.invite.preview.useQuery({ token: String(token) }, { enabled: !!token });
  const claim = trpc.invite.claim.useMutation({
    onSuccess: (member) => router.replace(`/group/${member.groupId}`),
  });

  if (preview.isLoading) {
    return (
      <Screen>
        <ActivityIndicator color={c.brand} />
      </Screen>
    );
  }

  if (preview.error || !preview.data) {
    return (
      <Screen>
        <Card>
          <ErrorText>{t('invite.expired')}</ErrorText>
        </Card>
      </Screen>
    );
  }

  const signedIn = !!session?.user;

  return (
    <Screen scroll>
      {/* Branding first — this is often the invitee's first sight of the app. */}
      <View style={{ alignItems: 'center', gap: c.spacing[1] }}>
        <Wordmark />
      </View>

      <Card>
        <Title numberOfLines={2}>{preview.data.groupName}</Title>
        <Text style={{ color: c.textMuted, fontSize: c.type.label.fontSize }}>
          {t('invite.claim')}
        </Text>
      </Card>

      {!signedIn ? (
        <Card>
          <Text style={{ color: c.textSecondary, fontSize: c.type.label.fontSize }}>
            {t('invite.signInToClaim')}
          </Text>
          <Button
            title={t('auth.signInBtn')}
            onPress={() => router.push({ pathname: '/sign-in', params: { next: `/invite/${token}` } })}
          />
        </Card>
      ) : (
        <Card>
          <SectionLabel>{t('invite.claim')}</SectionLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: c.spacing[3] }}>
            {preview.data.members.map((m) => (
              <View key={m.id} style={{ alignItems: 'center', gap: c.spacing[1] }}>
                <MemberChip
                  initials={m.initials}
                  color={m.color}
                  name={m.displayName}
                  onPress={() =>
                    claim.mutate({ token: String(token), memberId: m.id })
                  }
                />
                <Text style={{ color: c.textMuted, fontSize: c.type.caption.fontSize }}>
                  {m.displayName}
                </Text>
              </View>
            ))}
          </View>
          {claim.error ? <ErrorText>{claim.error.message}</ErrorText> : null}
          <Button
            title={t('invite.joinAsNew')}
            variant="secondary"
            loading={claim.isPending}
            onPress={() => claim.mutate({ token: String(token) })}
            testID="invite-join-new"
          />
        </Card>
      )}
    </Screen>
  );
}
