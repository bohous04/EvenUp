import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { ThemeProvider, useTheme } from '../theme';
import { lightTokens } from '../tokens';

function Probe() {
  const t = useTheme();
  return <Text>{t.brand}</Text>;
}

test('useTheme provides light tokens by default', () => {
  const { getByText } = render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
  expect(getByText(lightTokens.brand)).toBeTruthy();
});
