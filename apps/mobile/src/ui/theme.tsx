import { createContext, useContext, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { darkTokens, lightTokens, type ThemeTokens } from './tokens';

const ThemeContext = createContext<ThemeTokens>(lightTokens);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const tokens = scheme === 'dark' ? darkTokens : lightTokens;
  return <ThemeContext.Provider value={tokens}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeTokens {
  return useContext(ThemeContext);
}
