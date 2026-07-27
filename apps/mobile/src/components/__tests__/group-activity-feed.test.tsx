import { fireEvent, render } from '@testing-library/react-native';
import { I18nProvider } from '@/lib/i18n';
import { ThemeProvider } from '@/ui/theme';

interface ListInput {
  groupId: string;
  memberId?: string;
  action?: string;
}

const mockListInputs: ListInput[] = [];
const mockList = {
  data: {
    items: [
      {
        id: 'a1',
        action: 'expense.created',
        payload: { title: 'Pizza' },
        createdAt: new Date('2026-07-20T10:00:00Z'),
        actorName: 'Petr',
      },
      {
        id: 'a2',
        action: 'member.merged',
        payload: { from: 'Jana K.', into: 'Jana' },
        createdAt: new Date('2026-07-19T10:00:00Z'),
        actorName: 'Jana',
      },
    ],
    nextCursor: null,
  },
  isLoading: false,
};

jest.mock('@/lib/trpc', () => ({
  trpc: {
    activity: {
      list: {
        useQuery: (input: ListInput) => {
          mockListInputs.push(input);
          return mockList;
        },
      },
    },
  },
}));

import { GroupActivityFeed } from '../GroupActivityFeed';

const MEMBERS = [
  { id: 'm1', displayName: 'Petr' },
  { id: 'm2', displayName: 'Jana' },
];

function renderFeed() {
  return render(
    <I18nProvider>
      <ThemeProvider>
        <GroupActivityFeed groupId="g1" members={MEMBERS} baseCurrency="CZK" />
      </ThemeProvider>
    </I18nProvider>,
  );
}

beforeEach(() => {
  mockListInputs.length = 0;
});

test('renders a row per item without the group name — the group is implied here', () => {
  const { getAllByTestId, getByText, queryByText } = renderFeed();

  expect(getAllByTestId('activity-row')).toHaveLength(2);
  expect(getByText('Petr vytvořil(a) Pizza')).toBeTruthy();
  // No `group · date` prefix: unlike the cross-group tab, the group is context.
  expect(queryByText(/·/)).toBeNull();
});

test('renders member.merged from payload fields the API allow-list must pass through', () => {
  const { getByText } = renderFeed();

  // Guards the ACTIVITY_PAYLOAD_FIELDS/describeActivity pairing end-to-end: if
  // `from`/`into` were stripped, this line would render with empty names.
  expect(getByText('Jana sloučil(a) Jana K. do Jana')).toBeTruthy();
});

test('filters by member — the filter the cross-group tab cannot offer', () => {
  const { getByText } = renderFeed();

  expect(mockListInputs[0]).toEqual({ groupId: 'g1', memberId: undefined, action: undefined });

  fireEvent.press(getByText('Jana'));

  expect(mockListInputs.at(-1)).toEqual({ groupId: 'g1', memberId: 'm2', action: undefined });
});

test('filters by action type', () => {
  const { getByText } = renderFeed();

  fireEvent.press(getByText('Výdaj přidán'));

  expect(mockListInputs.at(-1)).toEqual({
    groupId: 'g1',
    memberId: undefined,
    action: 'expense.created',
  });
});
