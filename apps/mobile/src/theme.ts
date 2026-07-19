import { lightTokens } from './ui/tokens';

// Back-compat: existing screens import a static light `theme`. New/rebuilt
// screens should use `useTheme()` from '@/ui/theme' for dark-mode support.
export const theme = lightTokens;
