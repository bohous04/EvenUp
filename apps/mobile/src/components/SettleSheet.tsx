import { useState } from 'react';
import { Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { trpc } from '@/lib/trpc';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { Button, BottomSheet, SegmentedControl } from '@/ui';

type Method = 'CASH' | 'BANK' | 'QR';

export interface PendingPayment {
  fromMemberId: string;
  toMemberId: string;
  fromName: string;
  toName: string;
  amountMinorUnits: number;
}

/** Settle a suggested payment: cash / bank / QR, with a SPAYD QR when the creditor has an IBAN (FR-7.1/7.3). */
export function SettleSheet({
  visible,
  onClose,
  groupId,
  currency,
  payment,
}: {
  visible: boolean;
  onClose: () => void;
  groupId: string;
  currency: string;
  payment: PendingPayment | null;
}) {
  const { t, formatCurrency } = useI18n();
  const c = useTheme();
  const utils = trpc.useUtils();
  const [method, setMethod] = useState<Method>('CASH');

  const spayd = trpc.settlement.generateSpayd.useQuery(
    {
      groupId,
      toMemberId: payment?.toMemberId ?? '',
      amountMinorUnits: payment?.amountMinorUnits ?? 0,
      currency,
    },
    { enabled: !!payment && method === 'QR', retry: false },
  );

  const record = trpc.transaction.recordTransfer.useMutation({
    onSuccess: () => {
      void utils.balance.get.invalidate({ groupId });
      void utils.transaction.list.invalidate({ groupId });
      onClose();
    },
  });

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('settle.title')}>
      {payment ? (
        <View style={{ gap: 14 }}>
          <Text style={{ color: c.text, fontWeight: '600' }}>
            {payment.fromName} → {payment.toName}:{' '}
            {formatCurrency(payment.amountMinorUnits, currency)}
          </Text>

          <SegmentedControl<Method>
            options={[
              { value: 'CASH', label: t('settle.method.cash') },
              { value: 'BANK', label: t('settle.method.bank') },
              { value: 'QR', label: t('settle.method.qr') },
            ]}
            value={method}
            onChange={setMethod}
          />

          {method === 'QR' ? (
            spayd.isLoading ? (
              <Text style={{ color: c.textMuted }}>{t('common.loading')}</Text>
            ) : spayd.data ? (
              <View style={{ alignItems: 'center', gap: 8 }}>
                <View style={{ backgroundColor: '#fff', padding: 12, borderRadius: 8 }}>
                  <QRCode value={spayd.data.spayd} size={200} />
                </View>
                <Text style={{ color: c.textMuted, fontSize: 12 }}>{t('settle.qrCode')}</Text>
              </View>
            ) : (
              <Text style={{ color: c.danger }}>{t('settle.noIban')}</Text>
            )
          ) : null}

          <Button
            title={t('settle.markPaid')}
            loading={record.isPending}
            onPress={() =>
              record.mutate({
                groupId,
                fromMemberId: payment.fromMemberId,
                toMemberId: payment.toMemberId,
                amountMinorUnits: payment.amountMinorUnits,
                currency,
                method,
              })
            }
            testID="settle-confirm"
          />
        </View>
      ) : null}
    </BottomSheet>
  );
}
