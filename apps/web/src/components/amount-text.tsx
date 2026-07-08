'use client';
import { useI18n } from '@/lib/i18n';

/**
 * Money amounts: tabular digits, optional sign coloring, and never wrapped —
 * regular spaces from the formatter become NBSP (design-spec hard rule).
 */
export function AmountText({
  minorUnits,
  currency,
  colored = false,
  className = '',
  testId,
}: {
  minorUnits: number;
  currency: string;
  colored?: boolean;
  className?: string;
  testId?: string;
}) {
  const { formatCurrency } = useI18n();
  const text = formatCurrency(minorUnits, currency).replace(/ /g, ' ');
  const color = !colored
    ? ''
    : minorUnits === 0
      ? 'text-zinc-500 dark:text-zinc-400'
      : minorUnits > 0
        ? 'text-green-600 dark:text-green-400'
        : 'text-red-600 dark:text-red-400';
  return (
    <span className={`whitespace-nowrap tabular-nums ${color} ${className}`} data-testid={testId}>
      {text}
    </span>
  );
}
