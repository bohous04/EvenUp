import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import { useSession } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { MemberChip } from '@/components/MemberChip';
import { theme } from '@/theme';

const TEMPLATES = ['TRIP', 'HOUSEHOLD', 'COUPLE', 'EVENT', 'OTHER'] as const;
const CURRENCIES = ['CZK', 'EUR', 'USD', 'GBP', 'PLN'] as const;
const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export default function GroupsScreen() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const { t } = useI18n();
  const utils = trpc.useUtils();
  const groups = trpc.group.list.useQuery(undefined, { enabled: !!session?.user });

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>('CZK');
  const [template, setTemplate] = useState<(typeof TEMPLATES)[number]>('TRIP');

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
      <View style={styles.center}>
        <ActivityIndicator color={theme.brand} />
      </View>
    );
  }

  const canCreate = name.trim().length > 0 && !createGroup.isPending;

  return (
    <View style={styles.container}>
      <FlatList
        contentContainerStyle={{ padding: theme.space, gap: 12 }}
        data={groups.data ?? []}
        keyExtractor={(g) => g.id}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 4 }}>
            <Pressable
              style={styles.newButton}
              onPress={() => setShowForm((v) => !v)}
              accessibilityRole="button"
              testID="new-group-btn"
            >
              <Ionicons name={showForm ? 'close' : 'add'} size={18} color="#fff" />
              <Text style={styles.newButtonText}>{t('group.create')}</Text>
            </Pressable>

            {showForm ? (
              <View style={styles.form}>
                <TextInput
                  style={styles.input}
                  placeholder={t('group.name')}
                  placeholderTextColor={theme.textMuted}
                  value={name}
                  onChangeText={setName}
                  autoFocus
                  accessibilityLabel={t('group.name')}
                  testID="group-name-input"
                />

                <Text style={styles.label}>{t('group.baseCurrency')}</Text>
                <View style={styles.chipRow}>
                  {CURRENCIES.map((c) => {
                    const active = c === currency;
                    return (
                      <Pressable
                        key={c}
                        onPress={() => setCurrency(c)}
                        style={[styles.chip, active && styles.chipActive]}
                        accessibilityRole="button"
                      >
                        <Text style={active ? styles.chipTextActive : styles.chipText}>{c}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.label}>{t('group.template')}</Text>
                <View style={styles.chipRow}>
                  {TEMPLATES.map((tpl) => {
                    const active = tpl === template;
                    return (
                      <Pressable
                        key={tpl}
                        onPress={() => setTemplate(tpl)}
                        style={[styles.chip, active && styles.chipActive]}
                        accessibilityRole="button"
                      >
                        <Text style={active ? styles.chipTextActive : styles.chipText}>
                          {titleCase(tpl)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Pressable
                  style={[styles.button, !canCreate && styles.buttonDisabled]}
                  onPress={() =>
                    createGroup.mutate({ name: name.trim(), template, baseCurrency: currency })
                  }
                  disabled={!canCreate}
                  accessibilityRole="button"
                  testID="group-create-submit"
                >
                  <Text style={styles.buttonText}>
                    {createGroup.isPending ? t('common.loading') : t('group.create')}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.muted}>
            {groups.isLoading ? t('common.loading') : t('group.empty')}
          </Text>
        }
        renderItem={({ item }) => (
          <Link href={`/group/${item.id}`} asChild>
            <Pressable style={styles.card} accessibilityRole="button">
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{item.name}</Text>
                <Text style={styles.muted}>{item.baseCurrency}</Text>
              </View>
              <View style={{ flexDirection: 'row' }}>
                {item.members.slice(0, 4).map((m, i) => (
                  <MemberChip
                    key={m.id}
                    initials={m.initials}
                    color={m.color}
                    name={m.displayName}
                    size={28}
                    style={{ marginLeft: i === 0 ? 0 : -8 }}
                  />
                ))}
              </View>
            </Pressable>
          </Link>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.brand,
    borderRadius: theme.radius,
    padding: 14,
  },
  newButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  form: {
    backgroundColor: theme.card,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    padding: theme.space,
    gap: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.bg,
    borderRadius: theme.radius,
    padding: 12,
    fontSize: 16,
    color: theme.text,
  },
  label: { color: theme.textMuted, fontSize: 13, marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: theme.bg,
  },
  chipActive: { backgroundColor: theme.brand, borderColor: theme.brand },
  chipText: { color: theme.text, fontWeight: '600' },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  button: {
    backgroundColor: theme.brand,
    borderRadius: theme.radius,
    padding: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: theme.radius,
    padding: theme.space,
    borderWidth: 1,
    borderColor: theme.border,
  },
  title: { fontSize: 16, fontWeight: '600', color: theme.text },
  muted: { color: theme.textMuted, marginTop: 2 },
});
