import { useState } from 'react';
import { Text, View } from 'react-native';
import { trpc } from '@/lib/trpc';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { Button, BottomSheet, ErrorText, Input, Label } from '@/ui';
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
  const [error, setError] = useState<string | null>(null);

  const importCsv = trpc.transaction.importCsv.useMutation({
    onSuccess: (r) => {
      setResult(String((r as { imported?: number }).imported ?? ''));
      setError(null);
      setCsv('');
      void utils.transaction.list.invalidate({ groupId });
      void utils.balance.get.invalidate({ groupId });
    },
    onError: (e) => {
      setError(e.message);
      setResult(null);
    },
  });

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('csv.import')}
      closeLabel={t('receipt.close')}
    >
      <View style={{ gap: c.spacing[3] }}>
        <View style={{ gap: c.spacing[2] }}>
          <Label>{t('expense.paidBy')}</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: c.spacing[2.5] }}>
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
        </View>

        <Input
          label={t('csv.import')}
          value={csv}
          onChangeText={setCsv}
          placeholder="date,title,amount"
          multiline
          numberOfLines={6}
          style={{ minHeight: 120, paddingTop: c.spacing[3], textAlignVertical: 'top' }}
        />

        {error ? <ErrorText>{error}</ErrorText> : null}
        {result ? (
          <Text style={{ color: c.green, fontSize: c.type.label.fontSize }}>{result}</Text>
        ) : null}

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
