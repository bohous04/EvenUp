import { render } from '@testing-library/react-native';
import { I18nProvider } from '@/lib/i18n';
import { ThemeProvider } from '@/ui/theme';

jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ token: 'abc123' }) }));

import InviteScreen from '../invite/[token]';

test('invite route surfaces the token from the deep link', () => {
  const { getByTestId } = render(
    <I18nProvider>
      <ThemeProvider>
        <InviteScreen />
      </ThemeProvider>
    </I18nProvider>,
  );
  expect(getByTestId('invite-token').props.children).toBe('abc123');
});
