import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../theme';
import { BottomSheet } from '../BottomSheet';

test('renders children when visible', () => {
  const { getByText } = render(
    <ThemeProvider>
      <BottomSheet visible onClose={() => {}} title="Settle">
        <Text>Body</Text>
      </BottomSheet>
    </ThemeProvider>,
  );
  expect(getByText('Body')).toBeTruthy();
});
