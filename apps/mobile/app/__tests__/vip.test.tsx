import { fireEvent, render } from '@testing-library/react-native';
import { I18nProvider } from '@/lib/i18n';
import { ThemeProvider } from '@/ui/theme';

const mockMutate = jest.fn();
const mockOpenBrowser = jest.fn();
let mockSummaryData: Record<string, unknown> = {};
// Captured so a test can drive the mutation's own `onSuccess`, which is where
// the null-url handling lives.
let mockSubscribeOptions: { onSuccess?: (d: { url: string | null }) => void } = {};

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowser(...args),
}));

jest.mock('@/lib/auth', () => ({ useSession: () => ({ data: { user: { id: 'u1' } } }) }));

jest.mock('@/lib/trpc', () => ({
  trpc: {
    billing: {
      summary: {
        useQuery: () => ({
          isLoading: false,
          isPending: false,
          isError: false,
          error: null,
          data: mockSummaryData,
          refetch: jest.fn(),
        }),
      },
      checkoutSubscription: {
        useMutation: (opts?: { onSuccess?: (d: { url: string | null }) => void }) => {
          mockSubscribeOptions = opts ?? {};
          return { mutate: mockMutate, isPending: false };
        },
      },
      checkoutCredits: { useMutation: () => ({ mutate: mockMutate, isPending: false }) },
      portal: { useMutation: () => ({ mutate: mockMutate, isPending: false }) },
    },
  },
}));

import VipScreen from '../vip';

const FREE_USER = {
  billingEnabled: true,
  subscriptionAvailable: true,
  isVip: false,
  creditBalance: 0,
  subscription: null,
  currency: 'CZK',
  trialEligible: true,
  trialDays: 7,
  packs: [{ id: 'pack2', scans: 2, priceId: 'price_x' }],
  receiptRetentionDays: 30,
};

function renderScreen(overrides: Record<string, unknown> = {}) {
  mockSummaryData = { ...FREE_USER, ...overrides };
  return render(
    <I18nProvider>
      <ThemeProvider>
        <VipScreen />
      </ThemeProvider>
    </I18nProvider>,
  );
}

beforeEach(() => {
  mockMutate.mockClear();
  mockOpenBrowser.mockClear();
  mockSubscribeOptions = {};
});

test('subscribing fires checkoutSubscription', () => {
  const { getByTestId } = renderScreen();
  fireEvent.press(getByTestId('vip-subscribe'));
  expect(mockMutate).toHaveBeenCalledWith(undefined);
});

test('managing an existing subscription fires portal instead', () => {
  const { getByTestId } = renderScreen({
    subscription: { status: 'active', currentPeriodEnd: new Date(), cancelAtPeriodEnd: false },
  });
  fireEvent.press(getByTestId('vip-manage'));
  expect(mockMutate).toHaveBeenCalledWith(undefined);
});

test('buying a credit pack acknowledges the immediate charge', () => {
  const { getByTestId } = renderScreen();
  fireEvent.press(getByTestId('vip-buy-pack2'));
  // The web panel gates this behind a checkbox. A native button press is its
  // own acknowledgement, so the screen supplies it; the server re-checks.
  expect(mockMutate).toHaveBeenCalledWith({ packId: 'pack2', acknowledgeImmediate: true });
});

test('opens the Stripe url returned by checkout in an in-app browser', () => {
  renderScreen();
  mockSubscribeOptions.onSuccess?.({ url: 'https://checkout.stripe.com/c/pay/cs_test_123' });
  expect(mockOpenBrowser).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test_123');
});

test('a null Stripe url surfaces an error instead of silently doing nothing', () => {
  const { getByTestId } = renderScreen();
  mockSubscribeOptions.onSuccess?.({ url: null });
  expect(mockOpenBrowser).not.toHaveBeenCalled();
  expect(getByTestId('vip-error')).toBeTruthy();
});

test('a self-hosted instance with billing off shows the disabled notice, no subscribe', () => {
  const { getByTestId, queryByTestId } = renderScreen({ billingEnabled: false });
  expect(getByTestId('vip-disabled')).toBeTruthy();
  expect(queryByTestId('vip-subscribe')).toBeNull();
});

test('hides Subscribe when the instance has no price configured', () => {
  const { queryByTestId, getByTestId } = renderScreen({ subscriptionAvailable: false });
  expect(queryByTestId('vip-subscribe')).toBeNull();
  expect(getByTestId('vip-subscription-unavailable')).toBeTruthy();
});

test('a trial-eligible user sees the free-trial label with the trial length', () => {
  const { getByText } = renderScreen({ trialEligible: true, trialDays: 7 });
  expect(getByText('Vyzkoušet 7 dní zdarma')).toBeTruthy();
});

test('a returning subscriber sees the plain label, not the trial', () => {
  const { getByText } = renderScreen({ trialEligible: false });
  expect(getByText('Předplatit VIP')).toBeTruthy();
});

test('flags a past-due subscription rather than reading as active', () => {
  const { getByTestId } = renderScreen({
    subscription: { status: 'past_due', currentPeriodEnd: new Date(), cancelAtPeriodEnd: false },
  });
  expect(getByTestId('vip-payment-problem')).toBeTruthy();
});
