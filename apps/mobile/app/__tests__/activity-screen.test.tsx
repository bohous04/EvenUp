import { fireEvent, render } from '@testing-library/react-native';
import { I18nProvider } from '@/lib/i18n';
import { ThemeProvider } from '@/ui/theme';

jest.mock('@/lib/auth', () => ({ useSession: () => ({ data: { user: { id: 'u1' } } }) }));

interface FeedInput {
  groupId?: string;
  action?: string;
  limit: number;
}

const mockFeedInputs: FeedInput[] = [];
const mockFetchNextPage = jest.fn();
const mockFeed = {
  data: {
    pages: [
      {
        items: [
          {
            id: 'a1',
            action: 'expense.created',
            payload: { title: 'Pizza' },
            createdAt: new Date('2026-07-20T10:00:00Z'),
            actorName: 'Petr',
            groupId: 'g1',
            groupName: 'Chata',
            baseCurrency: 'CZK',
          },
          {
            id: 'a2',
            action: 'settlement.recorded',
            payload: { amount: 25000 },
            createdAt: new Date('2026-07-19T10:00:00Z'),
            actorName: 'Jana',
            groupId: 'g2',
            groupName: 'Byt',
            baseCurrency: 'EUR',
          },
        ],
        nextCursor: 'a2',
      },
    ],
  },
  isLoading: false,
  hasNextPage: true,
  isFetchingNextPage: false,
  fetchNextPage: mockFetchNextPage,
};

jest.mock('@/lib/trpc', () => ({
  trpc: {
    group: {
      list: {
        useQuery: () => ({
          data: [
            { id: 'g1', name: 'Chata' },
            { id: 'g2', name: 'Byt' },
          ],
        }),
      },
    },
    activity: {
      feed: {
        useInfiniteQuery: (input: FeedInput) => {
          mockFeedInputs.push(input);
          return mockFeed;
        },
      },
    },
  },
}));

import ActivityScreen from '../(tabs)/activity';

function renderScreen() {
  return render(
    <I18nProvider>
      <ThemeProvider>
        <ActivityScreen />
      </ThemeProvider>
    </I18nProvider>,
  );
}

beforeEach(() => {
  mockFeedInputs.length = 0;
  mockFetchNextPage.mockClear();
});

test('renders one row per activity item, described and tagged with its group', () => {
  const { getAllByTestId, getByText } = renderScreen();

  expect(getAllByTestId('activity-row')).toHaveLength(2);
  expect(getByText('Petr vytvořil(a) Pizza')).toBeTruthy();
  // The settlement amount uses the row's own group currency, not the first row's.
  expect(getByText(/Jana vyrovnal\(a\) platbu .*250/)).toBeTruthy();
  expect(getByText(/^Chata · /)).toBeTruthy();
  expect(getByText(/^Byt · /)).toBeTruthy();
});

test('starts unfiltered and narrows to a group when its chip is tapped', () => {
  const { getByText } = renderScreen();

  expect(mockFeedInputs[0]).toEqual({ groupId: undefined, action: undefined, limit: 20 });

  fireEvent.press(getByText('Chata'));

  expect(mockFeedInputs.at(-1)).toEqual({ groupId: 'g1', action: undefined, limit: 20 });
});

test('narrows to an action type when its chip is tapped', () => {
  const { getByText } = renderScreen();

  fireEvent.press(getByText('Výdaj přidán'));

  expect(mockFeedInputs.at(-1)).toEqual({
    groupId: undefined,
    action: 'expense.created',
    limit: 20,
  });
});

test('load-more asks for the next page', () => {
  const { getByTestId } = renderScreen();

  fireEvent.press(getByTestId('activity-load-more'));

  expect(mockFetchNextPage).toHaveBeenCalled();
});

test('shows the empty state when the feed has no items', () => {
  mockFeed.data = { pages: [{ items: [], nextCursor: null }] } as unknown as typeof mockFeed.data;
  mockFeed.hasNextPage = false;

  const { queryAllByTestId, getByText } = renderScreen();

  expect(queryAllByTestId('activity-row')).toHaveLength(0);
  expect(getByText('Zatím žádná aktivita')).toBeTruthy();
});
