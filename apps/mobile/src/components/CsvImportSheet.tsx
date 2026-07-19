import { useState } from 'react';
import { Text, View } from 'react-native';
import { trpc } from '@/lib/trpc';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { Button, BottomSheet, Input } from '@/ui';
import { MemberChip } from '@/components/MemberChip';

interface MemberLite {
  id: string;
  displayName: string;
  initials: string;
  color: string;
}

/** Paste-and-import a CSV of expenses, attributed to one payer (PRD §13 Phase 4). */
export function CsvImportSheet({
  visible,
  onClose,
  groupId,
  members,
}: {
  visible: boolean;
  onClose: () => void;
  groupId: string;
  members: MemberLite[];
}) {
  const { t } = useI18n();
  const c = useTheme();
  const utils = trpc.useUtils();
  const [csv, setCsv] = useState('');
  const [payerId, setPayerId] = useState<string | null>(members[0]?.id ?? null);
  const [result, setResult] = useState<string | null>(null);

  const importCsv = trpc.transaction.importCsv.useMutation({
    onSuccess: (r) => {
      setResult(String((r as { imported?: number }).imported ?? ''));
      setCsv('');
      void utils.transaction.list.invalidate({ groupId });
      void utils.balance.get.invalidate({ groupId });
    },
    onError: (e) => setResult(e.message),
  });

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('csv.import')}>
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {members.map((m) => (
            <MemberChip
              key={m.id}
              initials={m.initials}
              color={m.color}
              name={m.displayName}
              selected={payerId === m.id}
              onPress={() => setPayerId(m.id)}
            />
          ))}
        </View>
        <Input
          value={csv}
          onChangeText={setCsv}
          placeholder="date,title,amount"
          multiline
          numberOfLines={6}
          style={{ minHeight: 120, textAlignVertical: 'top' }}
        />
        {result ? <Text style={{ color: c.textMuted }}>{result}</Text> : null}
        <Button
          title={t('csv.import')}
          loading={importCsv.isPending}
          disabled={!csv.trim() || !payerId}
          onPress={() => payerId && importCsv.mutate({ groupId, csv: csv.trim(), payerMemberId: payerId })}
        />
      </View>
    </BottomSheet>
  );
}
