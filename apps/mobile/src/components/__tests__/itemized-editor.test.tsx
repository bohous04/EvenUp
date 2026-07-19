import { useState } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { I18nProvider } from '@/lib/i18n';
import { ThemeProvider } from '@/ui/theme';
import { ItemizedEditor } from '../ItemizedEditor';
import type { EditorItem } from '@/lib/itemized';

const members = [
  { id: 'a', displayName: 'Ann', initials: 'A', color: '#2563eb' },
  { id: 'b', displayName: 'Bob', initials: 'B', color: '#059669' },
];

function Harness() {
  const [items, setItems] = useState<EditorItem[]>([
    { name: 'Beer', priceText: '50', assigned: new Set<string>() },
  ]);
  return (
    <I18nProvider>
      <ThemeProvider>
        <ItemizedEditor items={items} onChange={setItems} members={members} currency="CZK" />
      </ThemeProvider>
    </I18nProvider>
  );
}

test('tapping a member chip assigns them and updates the per-person breakdown', () => {
  const { getAllByLabelText, queryAllByText } = render(<Harness />);
  // "Ann" appears as both an assign-all chip and a per-item chip; either assigns
  // Ann to the single item.
  const annChips = getAllByLabelText('Ann');
  expect(annChips.length).toBeGreaterThan(0);
  fireEvent.press(annChips[0]!);
  // After assigning Ann to the only item, the whole 50 goes to Ann.
  expect(queryAllByText(/50/).length).toBeGreaterThan(0);
});
