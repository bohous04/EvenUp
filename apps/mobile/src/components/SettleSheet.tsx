import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { deriveInitials } from '@evenup/core';
import { trpc } from '@/lib/trpc';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { lightTokens } from '@/ui/tokens';
import { AmountText, Button, BottomSheet } from '@/ui';
import { MemberChip } from '@/components/MemberChip';

export interface PendingPayment {
  fromMemberId: string;
  toMemberId: string;
  fromName: string;
  toName: string;
  amountMinorUnits: number;
  /** Chip colours, when the caller has the roster to hand. Optional so the
   *  sheet degrades to a plain name pair rather than inventing a colour. */
  fromColor?: string;
  toColor?: string;
  fromInitials?: string;
  toInitials?: string;
}

/** Settle a suggested payment: cash or QR, with a SPAYD QR when the creditor has an IBAN (FR-7.1/7.3). */
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
  const { t } = useI18n();
  const c = useTheme();
  const utils = trpc.useUtils();

  const spayd = trpc.settlement.generateSpayd.useQuery(
    {
      groupId,
      toMemberId: payment?.toMemberId ?? '',
      amountMinorUnits: payment?.amountMinorUnits ?? 0,
      currency,
    },
    { enabled: visible && !!payment, retry: false },
  );

  const record = trpc.transaction.recordTransfer.useMutation({
    onSuccess: () => {
      void utils.balance.get.invalidate({ groupId });
      void utils.transaction.list.invalidate({ groupId });
      onClose();
    },
  });

  const settle = (method: 'CASH' | 'QR') => {
    if (!payment) return;
    record.mutate({
      groupId,
      fromMemberId: payment.fromMemberId,
      toMemberId: payment.toMemberId,
      amountMinorUnits: payment.amountMinorUnits,
      currency,
      method,
    });
  };

  const party = (name: string, color?: string, initials?: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: c.spacing[2] }}>
      {color ? (
        <MemberChip
          initials={initials ?? deriveInitials(name)}
          color={color}
          name={name}
          size="sm"
        />
      ) : null}
      <Text
        numberOfLines={1}
        style={{
          color: c.text,
          fontSize: c.type.label.fontSize,
          fontWeight: c.type.bodySemibold.fontWeight,
        }}
      >
        {name}
      </Text>
    </View>
  );

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('settle.title')}
      closeLabel={t('receipt.close')}
    >
      {payment ? (
        <View style={{ alignItems: 'center', gap: c.spacing[4] }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: c.spacing[2],
            }}
          >
            {party(payment.fromName, payment.fromColor, payment.fromInitials)}
            <Ionicons name="arrow-forward" size={14} color={c.textFaint} />
            {party(payment.toName, payment.toColor, payment.toInitials)}
          </View>

          <AmountText
            minorUnits={payment.amountMinorUnits}
            currency={currency}
            style={{
              fontSize: c.type.amount.fontSize,
              fontWeight: c.type.amount.fontWeight,
              letterSpacing: c.type.amount.letterSpacing,
            }}
          />

          {spayd.data ? (
            <>
              {/* The QR always prints on light "paper": its modules are drawn
                  dark, and banking scanners don't reliably read an inverted
                  code, so this one surface stays light in both schemes (web
                  hardcodes `bg-white` here for the same reason). */}
              <View
                style={{
                  backgroundColor: lightTokens.card,
                  padding: c.spacing[2],
                  borderRadius: c.radii.lg,
                }}
              >
                <QRCode value={spayd.data.spayd} size={200} />
              </View>
              <Text
                selectable
                style={{
                  color: c.textMuted,
                  fontSize: c.type.caption.fontSize,
                  textAlign: 'center',
                }}
              >
                {spayd.data.spayd}
              </Text>
            </>
          ) : spayd.isError ? (
            <Text
              style={{ color: c.textMuted, fontSize: c.type.meta.fontSize, textAlign: 'center' }}
            >
              {t('settle.noIban')}
            </Text>
          ) : (
            <Text
              style={{ color: c.textMuted, fontSize: c.type.meta.fontSize, textAlign: 'center' }}
            >
              {t('common.loading')}
            </Text>
          )}

          <View style={{ flexDirection: 'row', gap: c.spacing[2], alignSelf: 'stretch' }}>
            <Button
              title={t('settle.method.cash')}
              variant="secondary"
              disabled={record.isPending}
              onPress={() => settle('CASH')}
              testID="settle-cash"
              style={{ flex: 1 }}
            />
            <Button
              title={t('settle.markPaid')}
              loading={record.isPending}
              onPress={() => settle('QR')}
              testID="settle-confirm"
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ) : null}
    </BottomSheet>
  );
}
