import { TextInput, View } from 'react-native';
import { currencyExponent } from '@evenup/core';
import { Input } from './Input';
import { useTheme } from './theme';

/** Clamp a free-typed amount to the currency's decimal places (ported from web `lib/amount-input`). */
export function clampAmountDecimals(raw: string, currency: string): string {
  const sepIndex = raw.search(/[.,]/);
  if (sepIndex === -1) return raw;
  const intPart = raw.slice(0, sepIndex);
  const exp = currencyExponent(currency);
  if (exp === 0) return intPart;
  const sep = raw[sepIndex]!;
  const fraction = raw.slice(sepIndex + 1).replace(/[.,]/g, '');
  return `${intPart}${sep}${fraction.slice(0, exp)}`;
}

export function AmountInput({
  value,
  onChangeText,
  currency,
  label,
  testID,
}: {
  value: string;
  onChangeText: (v: string) => void;
  currency: string;
  label?: string;
  testID?: string;
}) {
  return (
    <Input
      value={value}
      onChangeText={(v) => onChangeText(clampAmountDecimals(v, currency))}
      keyboardType="decimal-pad"
      placeholder={`0 ${currency}`}
      label={label}
      testID={testID}
    />
  );
}

/**
 * The amount-first hero field from web's expense form: a borderless, centred
 * `text-4xl font-extrabold tabular-nums` input with the currency pinned to its
 * right. The whole form is built around this being the first thing you touch.
 */
export function HeroAmountInput({
  value,
  onChangeText,
  currency,
  trailing,
  testID,
}: {
  value: string;
  onChangeText: (v: string) => void;
  currency: string;
  /** Currency selector rendered to the right of the figure. */
  trailing?: React.ReactNode;
  testID?: string;
}) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: c.spacing[2] }}>
      <TextInput
        value={value}
        onChangeText={(v) => onChangeText(clampAmountDecimals(v, currency))}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={c.textFaint}
        testID={testID}
        style={{
          minWidth: 140,
          textAlign: 'center',
          color: c.text,
          fontSize: c.type.amount.fontSize,
          fontWeight: c.type.amount.fontWeight,
          letterSpacing: c.type.amount.letterSpacing,
          fontVariant: ['tabular-nums'],
          paddingVertical: c.spacing[2],
        }}
      />
      {trailing}
    </View>
  );
}
