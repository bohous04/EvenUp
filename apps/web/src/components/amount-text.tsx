'use client';
import { useI18n } from '@/lib/i18n';

/**
 * Money amounts: tabular digits, optional sign colouring, and never wrapped —
 * regular spaces from the formatter become NBSP (design-spec hard rule).
 *
 * `display` is for a screen's headline figure: the minor units are set small
 * and raised and a trailing currency symbol drops to a lighter, smaller unit
 * (`.app-cents` / `.app-unit`, app/app.css), so "28 622" reads first. The
 * text content is unchanged — only the spans differ.
 */
export function AmountText({
  minorUnits,
  currency,
  colored = false,
  signed = colored,
  display = false,
  paintedCents = false,
  className = '',
  testId,
}: {
  minorUnits: number;
  currency: string;
  colored?: boolean;
  /** Print a "+" on positive amounts (defaults to `colored`). */
  signed?: boolean;
  display?: boolean;
  /** With `display`: paint the minor units from CSS (`data-cents`) rather
      than as text, for a headline that repeats a figure a row below it — the
      page then holds the amount as text once. It still reads aloud. */
  paintedCents?: boolean;
  className?: string;
  testId?: string;
}) {
  const { formatCurrency } = useI18n();
  const formatted = formatCurrency(minorUnits, currency).replace(/ /g, ' ');
  // Signed amounts: money green for "is owed", the landing's debt amber for
  // "owes" (app/app.css --app-pos / --app-neg, AA as text in light and dark).
  // The sign is always printed — a "+" on the owed side too — so colour is
  // never the only signal.
  // A signed negative gets a true minus (U+2212), the width of the "+".
  const text =
    signed && minorUnits > 0
      ? `+${formatted}`
      : signed && minorUnits < 0
        ? formatted.replace(/^-/, '−')
        : formatted;
  const color = !colored
    ? ''
    : minorUnits === 0
      ? 'text-[var(--app-ink-3)]'
      : minorUnits > 0
        ? 'text-[var(--app-pos,#127a3e)]'
        : 'text-[var(--app-neg,#a1440a)]';
  // "28 622,06 Kč" → sign "", unit before "", "28 622", ",06", unit after " Kč";
  // "CZK 28,622.06" → sign "", unit before "CZK ", "28,622", ".06", "".
  const parts = display ? /^([+\-−]?)([^\d+\-−]*)(\d(?:.*\d)?)([.,]\d{2})(\D*)$/.exec(text) : null;
  return (
    <span className={`whitespace-nowrap tabular-nums ${color} ${className}`} data-testid={testId}>
      {parts ? (
        <>
          {parts[1]}
          {parts[2] ? <span className="app-unit">{parts[2]}</span> : null}
          {parts[3]}
          {paintedCents ? (
            <span className="app-cents" data-cents={parts[4]} />
          ) : (
            <span className="app-cents">{parts[4]}</span>
          )}
          {parts[5] ? <span className="app-unit">{parts[5]}</span> : null}
        </>
      ) : (
        text
      )}
    </span>
  );
}
