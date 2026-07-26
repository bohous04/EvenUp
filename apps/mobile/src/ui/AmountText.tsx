import { Text, type StyleProp, type TextStyle } from 'react-native';
import { useI18n } from '@/lib/i18n';
import { useTheme } from './theme';

/**
 * Money amounts — the design spec's hard rule, shared with web's `AmountText`:
 * tabular digits, optional sign colouring, and never wrapped. The formatter's
 * regular spaces become NBSP so `1 761,05 Kč` can't break across lines.
 */
export function AmountText({
  minorUnits,
  currency,
  colored = false,
  style,
  testID,
}: {
  minorUnits: number;
  currency: string;
  colored?: boolean;
  style?: StyleProp<TextStyle>;
  testID?: string;
}) {
  const { formatCurrency } = useI18n();
  const c = useTheme();
  const text = formatCurrency(minorUnits, currency).replace(/ /g, ' ');
  const color = !colored
    ? c.text
    : minorUnits === 0
      ? c.textMuted
      : minorUnits > 0
        ? c.green
        : c.red;

  return (
    <Text
      testID={testID}
      numberOfLines={1}
      style={[{ color, fontVariant: ['tabular-nums'], fontSize: c.type.label.fontSize }, style]}
    >
      {text}
    </Text>
  );
}
