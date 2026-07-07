import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import { magicLinkClient } from 'better-auth/client/plugins';
import * as SecureStore from 'expo-secure-store';
import { apiUrl } from './api';

/**
 * Better Auth client for Expo: tokens are kept in secure storage and the
 * `evenup://` scheme handles the magic-link / OAuth callback (PRD FR-1.5).
 */
export const authClient = createAuthClient({
  baseURL: apiUrl,
  plugins: [
    expoClient({ scheme: 'evenup', storagePrefix: 'evenup', storage: SecureStore }),
    magicLinkClient(),
  ],
});

export const { useSession, signIn, signOut } = authClient;
