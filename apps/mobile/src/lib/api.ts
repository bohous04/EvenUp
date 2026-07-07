import Constants from 'expo-constants';

/** Base URL of the EvenUp API/web server (set EXPO_PUBLIC_API_URL for builds). */
export const apiUrl: string =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  process.env.EXPO_PUBLIC_API_URL ??
  'http://localhost:3000';
