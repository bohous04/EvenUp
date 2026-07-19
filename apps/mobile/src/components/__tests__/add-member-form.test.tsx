import { fireEvent, render } from '@testing-library/react-native';
import { MEMBER_COLORS } from '@evenup/core';
import { I18nProvider } from '@/lib/i18n';
import { ThemeProvider } from '@/ui/theme';

const mockMutate = jest.fn();
jest.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      group: { get: { invalidate: jest.fn() } },
      member: { list: { invalidate: jest.fn() } },
    }),
    member: { add: { useMutation: () => ({ mutate: mockMutate, isPending: false }) } },
  },
}));

import { AddMemberForm } from '../AddMemberForm';

test('submits member.add with name, default color, share and role', () => {
  const { getByTestId } = render(
    <I18nProvider>
      <ThemeProvider>
        <AddMemberForm groupId="g1" />
      </ThemeProvider>
    </I18nProvider>,
  );
  fireEvent.changeText(getByTestId('member-name-input'), 'Petr');
  fireEvent.press(getByTestId('member-add-submit'));
  expect(mockMutate).toHaveBeenCalledWith({
    groupId: 'g1',
    displayName: 'Petr',
    color: MEMBER_COLORS[0],
    defaultShare: 1,
    role: 'MEMBER',
  });
});
