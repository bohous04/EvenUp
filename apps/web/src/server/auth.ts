/** Better Auth server instance (PRD §8.2): email magic link + optional Google / Apple. */
import 'server-only';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { magicLink, bearer } from 'better-auth/plugins';
import { nextCookies } from 'better-auth/next-js';
import { expo } from '@better-auth/expo';
import { prisma } from '@evenup/db';
import { env } from './env.js';
import { rememberMagicLink } from './magic-link-store.js';
import { sendEmail, magicLinkEmail } from './email.js';
import { appleClientSecret, initAppleClientSecret } from './apple-secret.js';
import { appleDisplayName } from './apple-profile.js';

const googleProvider =
  env.google.clientId && env.google.clientSecret
    ? { google: { clientId: env.google.clientId, clientSecret: env.google.clientSecret } }
    : undefined;

const { servicesId, teamId, keyId, privateKey, bundleId } = env.apple;
// Build the config in one narrowing step, so `servicesId` et al. are `string`
// below without non-null assertions. `let` because a failed mint below clears
// it back to `null`.
let appleSecret =
  servicesId && teamId && keyId && privateKey
    ? { servicesId, teamId, keyId, privateKey }
    : null;

// Mint the first client secret before the provider is constructed. Apple is
// an optional provider: if the key doesn't parse, we must not take down
// magic-link/Google sign-in with it (this file has a top-level `await`, so an
// unhandled rejection here would fail evaluation of every importer of
// `auth.ts`, i.e. every `/api/auth/*` route). So we fail *soft* — log loudly
// and disable Apple by clearing `appleSecret`, leaving everything else up.
if (appleSecret) {
  try {
    await initAppleClientSecret(appleSecret);
  } catch (error) {
    console.error(
      'APPLE_PRIVATE_KEY could not be parsed as a PKCS8 ES256 key. ' +
        'Sign In with Apple is DISABLED; other sign-in methods are unaffected.',
      error,
    );
    appleSecret = null;
  }
}

const appleProvider = appleSecret
  ? {
      apple: {
        clientId: appleSecret.servicesId,
        // A getter, not a value: Better Auth reads `options.clientSecret` on
        // every token exchange, which is what lets the JWT refresh in place.
        get clientSecret() {
          return appleClientSecret();
        },
        // Audience for validating *native* id_tokens only; the web callback
        // decodes its id_token without an audience check.
        appBundleIdentifier: bundleId,
        mapProfileToUser: (profile: { name?: string | null; email?: string | null }) => ({
          name: appleDisplayName(profile),
        }),
      },
    }
  : undefined;

const socialProviders =
  googleProvider || appleProvider ? { ...googleProvider, ...appleProvider } : undefined;

export const auth = betterAuth({
  baseURL: env.authUrl,
  secret: env.authSecret,
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: { enabled: false },
  // Rate limiting protects auth in production (§9.2); disabled in dev/E2E so the
  // test suite's rapid repeated sign-ins aren't throttled.
  rateLimit: { enabled: !env.authDevEcho },
  trustedOrigins: [
    'evenup://', // the Expo app's deep-link scheme (FR-1.5)
    'https://appleid.apple.com', // Apple form_posts the callback cross-origin
  ],
  // Link a social account into an existing user when the provider vouches for
  // the email. Apple and Google both send `email_verified`, so no
  // `trustedProviders` — that would force-link *unverified* emails.
  account: { accountLinking: { enabled: true } },
  socialProviders,
  plugins: [
    // Native deep-link session handoff for the Expo app: appends the session
    // cookie to the evenup:// redirect after magic-link verify so the client
    // can store it (without this, the app bounces back to sign-in). FR-1.5.
    expo(),
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        if (env.authDevEcho) rememberMagicLink(email, url); // local/E2E sign-in
        await sendEmail(magicLinkEmail(email, url));
      },
    }),
    bearer(), // token auth for the mobile app (Expo client stores it in secure storage)
    nextCookies(), // must be last
  ],
});

export type Session = typeof auth.$Infer.Session;
