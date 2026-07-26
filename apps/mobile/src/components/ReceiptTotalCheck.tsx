import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/ui/theme';
import { AmountText, Card, Checkbox, Input } from '@/ui';
import { checkReceiptTotal, type EditorItem } from '@/lib/itemized';

/** One labelled figure inside the mismatch banner — the item sum, or the gap to the receipt. */
function BannerFigure({
  label,
  minorUnits,
  currency,
  testID,
}: {
  label: string;
  minorUnits: number;
  currency: string;
  testID: string;
}) {
  const c = useTheme();
  const caption = { color: c.amberText, fontSize: c.type.caption.fontSize };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: c.spacing[1.5] }}>
      <Text style={caption}>{label}</Text>
      <AmountText
        minorUnits={minorUnits}
        currency={currency}
        testID={testID}
        style={{ ...caption, fontWeight: '600' }}
      />
    </View>
  );
}

/**
 * Editable receipt total with a live item-sum check (mirrors web's `ocr-scan.tsx`).
 *
 * The field is keyed in by hand as well as pre-filled from OCR, so a receipt
 * whose printed total the model missed can still be reconciled. While the rows
 * disagree with it, the user is offered a single proportional balancing line —
 * deposits, rounding, or an un-itemized discount the model couldn't attribute.
 */
export function ReceiptTotalCheck({
  items,
  currency,
  valueText,
  onChangeText,
  reconcile,
  onReconcileChange,
}: {
  items: EditorItem[];
  currency: string;
  /** Receipt total as an editable decimal string; blank until OCR or the user fills it. */
  valueText: string;
  onChangeText: (next: string) => void;
  reconcile: boolean;
  onReconcileChange: (next: boolean) => void;
}) {
  const { t } = useI18n();
  const c = useTheme();
  const { itemsSumMinor, diffMinor, status } = checkReceiptTotal(items, valueText, currency);

  return (
    <Card>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: c.spacing[2],
        }}
      >
        <Text style={{ color: c.text, ...c.type.bodyMedium }}>{t('ocr.receiptTotal')}</Text>
        <View style={{ width: 96 }}>
          <Input
            value={valueText}
            onChangeText={onChangeText}
            keyboardType="decimal-pad"
            placeholder="0"
            accessibilityLabel={t('ocr.receiptTotal')}
            testID="ocr-receipt-total-input"
            style={{ textAlign: 'right' }}
          />
        </View>
      </View>

      {status === 'match' ? (
        <View
          testID="ocr-total-matches"
          style={{ flexDirection: 'row', alignItems: 'center', gap: c.spacing[1.5] }}
        >
          <Ionicons name="checkmark-circle-outline" size={14} color={c.green} />
          <Text
            style={{
              color: c.green,
              fontSize: c.type.caption.fontSize,
              fontWeight: '500',
              flex: 1,
            }}
          >
            {t('ocr.totalMatches')}
          </Text>
        </View>
      ) : null}

      {status === 'mismatch' ? (
        <View
          testID="ocr-total-mismatch"
          style={{
            backgroundColor: c.amberBg,
            borderWidth: c.control.hairline,
            borderColor: c.amberText,
            borderRadius: c.radii.lg,
            padding: c.spacing[3],
            gap: c.spacing[2],
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: c.spacing[1.5] }}>
            <Ionicons name="alert-circle-outline" size={14} color={c.amberText} />
            <Text
              style={{
                color: c.amberText,
                fontSize: c.type.caption.fontSize,
                fontWeight: '500',
                flex: 1,
              }}
            >
              {t('ocr.totalMismatch')}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: c.spacing[4] }}>
            <BannerFigure
              label={t('common.total')}
              minorUnits={itemsSumMinor}
              currency={currency}
              testID="ocr-items-sum"
            />
            <BannerFigure
              label={t('ocr.difference')}
              minorUnits={diffMinor}
              currency={currency}
              testID="ocr-total-difference"
            />
          </View>

          <Checkbox
            label={t('ocr.reconcile')}
            checked={reconcile}
            onChange={onReconcileChange}
            testID="ocr-reconcile-toggle"
          />
        </View>
      ) : null}
    </Card>
  );
}
