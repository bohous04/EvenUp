import { render } from '@testing-library/react-native';
import { I18nProvider } from '@/lib/i18n';
import { ThemeProvider } from '@/ui/theme';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ token: 'abc123' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@/lib/auth', () => ({ useSession: () => ({ data: null }) }));

jest.mock('@/lib/trpc', () => ({
  trpc: {
    invite: {
      preview: {
        useQuery: () => ({
          isLoading: false,
          error: null,
          data: { groupName: 'Tatry 2026', members: [] },
        }),
      },
      claim: { useMutation: () => ({ mutate: jest.fn(), isPending: false, error: null }) },
    },
  },
}));

import InviteScreen from '../invite/[token]';

test('invite route shows the previewed group name for a signed-out visitor', () => {
  const { getByText } = render(
    <I18nProvider>
      <ThemeProvider>
        <InviteScreen />
      </ThemeProvider>
    </I18nProvider>,
  );
  expect(getByText('Tatry 2026')).toBeTruthy();
});
