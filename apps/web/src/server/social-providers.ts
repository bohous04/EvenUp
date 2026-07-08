/**
 * Pure provider-composition logic for Better Auth's `socialProviders` option,
 * split out of `auth.ts` so it is testable without booting the full auth
 * instance (which requires a live Postgres via `prismaAdapter`).
 */
import 'server-only';
import { appleClientSecret } from './apple-secret.js';
import { appleDisplayName } from './apple-profile.js';
import type { AppleSecretConfig } from './apple-secret.js';

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
}

export interface AppleConfig extends AppleSecretConfig {
  /** iOS App ID, used only to validate native id_tokens. */
  bundleId: string;
}

/**
 * Compose the `socialProviders` object Better Auth expects. Returns
 * `undefined` (never `{}`) when neither provider is configured — Better Auth
 * treats an empty object differently from an absent option.
 */
export function buildSocialProviders(google: GoogleConfig | null, apple: AppleConfig | null) {
  const googleProvider = google
    ? { google: { clientId: google.clientId, clientSecret: google.clientSecret } }
    : undefined;

  const appleProvider = apple
    ? {
        apple: {
          clientId: apple.servicesId,
          // A getter, not a value: Better Auth reads `options.clientSecret` on
          // every token exchange, which is what lets the JWT refresh in place.
          get clientSecret() {
            return appleClientSecret();
          },
          // Audience for validating *native* id_tokens only; the web callback
          // decodes its id_token without an audience check.
          appBundleIdentifier: apple.bundleId,
          mapProfileToUser: (profile: { name?: string | null; email?: string | null }) => ({
            name: appleDisplayName(profile),
          }),
        },
      }
    : undefined;

  return googleProvider || appleProvider ? { ...googleProvider, ...appleProvider } : undefined;
}
