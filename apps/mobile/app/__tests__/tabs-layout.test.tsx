import { render } from '@testing-library/react-native';
import { I18nProvider } from '@/lib/i18n';
import { ThemeProvider } from '@/ui/theme';

// Tabs needs a navigation container at runtime; for a wiring smoke test we mock
// it so the layout's useI18n()/useTheme() calls are exercised without a root nav.
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factory is hoisted; it cannot close over the top-level React import.
  const React = require('react');
  const Tabs: React.FC<{ children?: React.ReactNode }> & { Screen: React.FC } = ({ children }) =>
    React.createElement(React.Fragment, null, children);
  Tabs.Screen = () => null;
  return { Tabs };
});

import TabsLayout from '../(tabs)/_layout';

test('tabs layout renders without crashing', () => {
  const tree = render(
    <I18nProvider>
      <ThemeProvider>
        <TabsLayout />
      </ThemeProvider>
    </I18nProvider>,
  );
  expect(tree).toBeTruthy();
});
