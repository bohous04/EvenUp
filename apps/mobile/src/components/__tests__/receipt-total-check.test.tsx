import { useState } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { I18nProvider } from '@/lib/i18n';
import { ThemeProvider } from '@/ui/theme';
import { ReceiptTotalCheck } from '../ReceiptTotalCheck';
import type { EditorItem } from '@/lib/itemized';

/** Two rows summing to 80.00 — the reference the keyed-in total is checked against. */
const items: EditorItem[] = [
  { name: 'Beer', priceText: '50', assigned: new Set(['a']) },
  { name: 'Fries', priceText: '30', assigned: new Set(['b']) },
];

function Harness({
  initial = '',
  onReconcile,
}: {
  initial?: string;
  onReconcile?: (v: boolean) => void;
}) {
  const [text, setText] = useState(initial);
  const [reconcile, setReconcile] = useState(false);
  return (
    <I18nProvider>
      <ThemeProvider>
        <ReceiptTotalCheck
          items={items}
          currency="CZK"
          valueText={text}
          onChangeText={setText}
          reconcile={reconcile}
          onReconcileChange={(v) => {
            setReconcile(v);
            onReconcile?.(v);
          }}
        />
      </ThemeProvider>
    </I18nProvider>
  );
}

test('stays quiet until a receipt total is keyed in', () => {
  const { queryByTestId } = render(<Harness />);
  expect(queryByTestId('ocr-total-matches')).toBeNull();
  expect(queryByTestId('ocr-total-mismatch')).toBeNull();
});

test('confirms a match once the keyed-in total equals the item sum', () => {
  const { getByTestId, queryByTestId } = render(<Harness />);
  fireEvent.changeText(getByTestId('ocr-receipt-total-input'), '80');
  expect(queryByTestId('ocr-total-matches')).not.toBeNull();
  expect(queryByTestId('ocr-total-mismatch')).toBeNull();
});

test('flags a mismatch and names the difference when the total does not line up', () => {
  const { getByTestId, queryByTestId } = render(<Harness initial="100" />);
  expect(queryByTestId('ocr-total-matches')).toBeNull();
  expect(queryByTestId('ocr-total-mismatch')).not.toBeNull();
  // 100.00 keyed in against 80.00 of items — the user is shown the 20.00 gap.
  // AmountText renders the formatted string as its only child.
  expect(getByTestId('ocr-total-difference').props.children).toMatch(/20/);
  expect(getByTestId('ocr-items-sum').props.children).toMatch(/80/);
});

test('offers the balancing toggle only while the totals disagree', () => {
  const onReconcile = jest.fn();
  const { getByTestId, queryByTestId } = render(
    <Harness initial="100" onReconcile={onReconcile} />,
  );
  fireEvent.press(getByTestId('ocr-reconcile-toggle'));
  expect(onReconcile).toHaveBeenCalledWith(true);
  // Correcting the total to match retires both the banner and its toggle.
  fireEvent.changeText(getByTestId('ocr-receipt-total-input'), '80');
  expect(queryByTestId('ocr-reconcile-toggle')).toBeNull();
});
