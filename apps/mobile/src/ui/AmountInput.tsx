import { currencyExponent } from '@evenup/core';
import { Input } from './Input';

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
