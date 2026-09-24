import { fireEvent, render } from '@testing-library/react-native';
import { I18nProvider } from '@/lib/i18n';
import { ThemeProvider } from '@/ui/theme';

const mockUpdate = jest.fn();

jest.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      group: { get: { invalidate: jest.fn() }, list: { invalidate: jest.fn() } },
      balance: { get: { invalidate: jest.fn() } },
    }),
    group: {
      update: { useMutation: () => ({ mutate: mockUpdate, isPending: false }) },
      archive: { useMutation: () => ({ mutate: jest.fn(), isPending: false }) },
    },
  },
}));

import { GroupSettingsSheet } from '../GroupSettingsSheet';

function renderSheet(overrides: Partial<React.ComponentProps<typeof GroupSettingsSheet>> = {}) {
  const props = {
    visible: true,
    onClose: jest.fn(),
    groupId: 'g1',
    name: 'Eurotrip',
    simplifyDebts: true,
    archived: false,
    baseCurrency: 'CZK',
    fxLockedRate: null,
    ...overrides,
  };
  return render(
    <I18nProvider>
      <ThemeProvider>
        <GroupSettingsSheet {...props} />
      </ThemeProvider>
    </I18nProvider>,
  );
}

beforeEach(() => mockUpdate.mockClear());

test('locks the exchange rate with the typed value', () => {
  const { getByTestId } = renderSheet();
  fireEvent.changeText(getByTestId('fx-lock-input'), '25.5');
  fireEvent.press(getByTestId('fx-lock-submit'));
  expect(mockUpdate).toHaveBeenCalledWith({ groupId: 'g1', fxLockedRate: '25.5' });
});

test('disables the lock button until a rate is typed', () => {
  const { getByTestId } = renderSheet();
  expect(getByTestId('fx-lock-submit').props.accessibilityState?.disabled).toBe(true);
});

test('clears the lock', () => {
  const { getByTestId } = renderSheet({ fxLockedRate: '25.5' });
  fireEvent.press(getByTestId('fx-unlock'));
  expect(mockUpdate).toHaveBeenCalledWith({ groupId: 'g1', fxLockedRate: null });
});

test('shows the currently locked rate', () => {
  const { getByTestId } = renderSheet({ fxLockedRate: '25.5' });
  expect(getByTestId('fx-locked-rate').props.children).toContain('25.5');
});
