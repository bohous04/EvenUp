export interface ThemeTokens {
  brand: string;
  bg: string;
  card: string;
  text: string;
  textMuted: string;
  border: string;
  green: string;
  red: string;
  danger: string;
  overlay: string;
  radius: number;
  space: number;
}

export const lightTokens: ThemeTokens = {
  brand: '#2563eb',
  bg: '#f5f5f5',
  card: '#ffffff',
  text: '#171717',
  textMuted: '#737373',
  border: '#e5e5e5',
  green: '#15803d',
  red: '#b91c1c',
  danger: '#b91c1c',
  overlay: 'rgba(0,0,0,0.4)',
  radius: 14,
  space: 16,
};

export const darkTokens: ThemeTokens = {
  brand: '#3b82f6',
  bg: '#0a0a0a',
  card: '#171717',
  text: '#fafafa',
  textMuted: '#a3a3a3',
  border: '#262626',
  green: '#4ade80',
  red: '#f87171',
  danger: '#f87171',
  overlay: 'rgba(0,0,0,0.6)',
  radius: 14,
  space: 16,
};
