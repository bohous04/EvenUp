import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import { twoFactorClient } from 'better-auth/client/plugins';
import * as SecureStore from 'expo-secure-store';
import { apiUrl } from './api';

/**
 * Better Auth client for Expo: tokens are kept in secure storage and the
 * `evenup://` scheme handles the OAuth callback (PRD FR-1.5). The two-factor
 * client plugin mirrors the web client so a 2FA-protected account can complete
 * the TOTP / backup-code step on mobile.
 */
export const authClient = createAuthClient({
  baseURL: apiUrl,
  plugins: [
    expoClient({ scheme: 'evenup', storagePrefix: 'evenup', storage: SecureStore }),
    twoFactorClient(),
  ],
});

export const { useSession, signIn, signUp, signOut } = authClient;
