import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import { plural } from '@evenup/i18n';
import { useSession } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { MemberChip } from '@/components/MemberChip';
import {
  BottomSheet,
  Button,
  Card,
  EmptyState,
  Fab,
  Input,
  Label,
  Screen,
  SegmentedControl,
  Title,
} from '@/ui';
import { useTheme } from '@/ui/theme';

const CURRENCIES = ['CZK', 'EUR', 'USD', 'GBP', 'PLN'] as const;

/**
 * Web's create sheet has no template picker, but the mobile create call still
 * sends one — so it stays, with the catalog labels web uses elsewhere rather
 * than the title-cased enum value it used to render.
 */
const TEMPLATES = [
  { value: 'TRIP', labelKey: 'group.template.trip' },
  { value: 'HOUSEHOLD', labelKey: 'group.template.household' },
  { value: 'COUPLE', labelKey: 'group.template.couple' },
  { value: 'EVENT', labelKey: 'group.template.event' },
  { value: 'OTHER', labelKey: 'group.template.other' },
] as const;

type Template = (typeof TEMPLATES)[number]['value'];

/** Web's `AvatarStack`: `size="sm"` (28px) avatars, max 5, then a `+N` badge. */
const AVATAR_SIZE = 28;
const AVATAR_MAX = 5;

export default function GroupsScreen() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const { t, locale } = useI18n();
  const c = useTheme();
  const utils = trpc.useUtils();
  const groups = trpc.group.list.useQuery(undefined, { enabled: !!session?.user });

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>('CZK');
  const [template, setTemplate] = useState<Template>('TRIP');

  const createGroup = trpc.group.create.useMutation({
    onSuccess: (group) => {
      void utils.group.list.invalidate();
      setShowForm(false);
      setName('');
      router.push(`/group/${group.id}`);
    },
  });

  useEffect(() => {
    if (!isPending && !session?.user) router.replace('/sign-in');
  }, [isPending, session, router]);

  if (isPending || !session?.user) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.brand} />
      </Screen>
    );
  }

  const canCreate = name.trim().length > 0 && !createGroup.isPending;

  return (
    <View style={{ flex: 1 }}>
      <Screen scroll fabClearance>
        <Title>{t('nav.groups')}</Title>

        {groups.isLoading ? (
          <Text style={{ color: c.textMuted, fontSize: c.type.body.fontSize }}>
            {t('common.loading')}
          </Text>
        ) : groups.data && groups.data.length > 0 ? (
          // Web's `<ul className="space-y-3">` — tighter than the screen's own gap.
          <View style={{ gap: c.spacing[3] }}>
            {groups.data.map((g) => (
              <Link key={g.id} href={`/group/${g.id}`} asChild>
                {/* `group-row` gives the E2E flow a stable handle — it used to
                    tap `index: 0, text: '.*'`, which matches whatever happens
                    to render first. */}
                <Pressable accessibilityRole="button" testID="group-row">
                  {({ pressed }) => (
                    <Card
                      style={[
                        { flexDirection: 'row', alignItems: 'center' },
                        pressed && { backgroundColor: c.rowPressed, borderColor: c.borderInput },
                      ]}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          numberOfLines={1}
                          style={{
                            color: c.text,
                            fontSize: c.type.bodyBold.fontSize,
                            fontWeight: c.type.bodyBold.fontWeight,
                          }}
                        >
                          {g.name}
                        </Text>
                        <Text style={{ color: c.textMuted, fontSize: c.type.meta.fontSize }}>
                          {`${plural(locale, 'group.transactions', g._count.transactions)} · ${g.baseCurrency}`}
                        </Text>
                      </View>
                      <AvatarStack members={g.members} />
                    </Card>
                  )}
                </Pressable>
              </Link>
            ))}
          </View>
        ) : (
          <Card>
            <EmptyState
              icon={<Ionicons name="people-outline" size={28} color={c.textFaint} />}
              title={t('group.empty')}
            />
          </Card>
        )}
      </Screen>

      <Fab
        onPress={() => setShowForm(true)}
        accessibilityLabel={t('group.create')}
        testID="new-group-btn"
      />

      <BottomSheet
        visible={showForm}
        onClose={() => setShowForm(false)}
        title={t('group.create')}
        closeLabel={t('common.cancel')}
      >
        <Input
          label={t('group.name')}
          value={name}
          onChangeText={setName}
          autoFocus
          testID="group-name-input"
        />

        <View style={{ gap: c.spacing[1] }}>
          <Label>{t('group.baseCurrency')}</Label>
          <SegmentedControl
            options={CURRENCIES.map((cur) => ({ value: cur, label: cur }))}
            value={currency}
            onChange={setCurrency}
          />
        </View>

        <View style={{ gap: c.spacing[1] }}>
          <Label>{t('group.template')}</Label>
          <SegmentedControl
            options={TEMPLATES.map((tpl) => ({ value: tpl.value, label: t(tpl.labelKey) }))}
            value={template}
            onChange={setTemplate}
          />
        </View>

        <Button
          title={t('common.save')}
          onPress={() =>
            createGroup.mutate({ name: name.trim(), template, baseCurrency: currency })
          }
          loading={createGroup.isPending}
          disabled={!canCreate}
          testID="group-create-submit"
        />
      </BottomSheet>
    </View>
  );
}

/**
 * Web's `AvatarStack` — overlapping avatars with a `+N` overflow badge.
 *
 * The separating ring is a card-coloured pad around each chip rather than web's
 * `ring-2`: RN draws borders *inside* the box, so a border would eat into the
 * member colour instead of sitting outside it.
 */
function AvatarStack({
  members,
}: {
  members: { id: string; initials: string; color: string; displayName: string }[];
}) {
  const c = useTheme();
  const shown = members.slice(0, AVATAR_MAX);
  const extra = members.length - shown.length;
  const ring = {
    backgroundColor: c.card,
    borderRadius: c.radii.full,
    padding: c.spacing[0.5],
  };
  const overlap = { marginLeft: -c.spacing[1.5] };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {shown.map((m, i) => (
        <View key={m.id} style={[ring, i === 0 ? null : overlap]}>
          <MemberChip
            initials={m.initials}
            color={m.color}
            name={m.displayName}
            size={AVATAR_SIZE}
          />
        </View>
      ))}
      {extra > 0 ? (
        <View style={[ring, overlap]}>
          <View
            style={{
              width: AVATAR_SIZE,
              height: AVATAR_SIZE,
              borderRadius: c.radii.full,
              backgroundColor: c.track,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                color: c.textMuted,
                fontSize: c.type.caption.fontSize,
                fontWeight: c.type.section.fontWeight,
              }}
            >
              +{extra}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
