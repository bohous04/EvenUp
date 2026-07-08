/** Better Auth server instance (PRD §8.2): email + password, optional Google / Apple. */
import 'server-only';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { bearer } from 'better-auth/plugins';
import { nextCookies } from 'better-auth/next-js';
import { expo } from '@better-auth/expo';
import { prisma } from '@evenup/db';
import { env } from './env.js';
import { sendEmail, resetPasswordEmail, verifyEmail } from './email.js';
import { initAppleClientSecret } from './apple-secret.js';
import { buildSocialProviders } from './social-providers.js';

const googleConfig =
  env.google.clientId && env.google.clientSecret
    ? { clientId: env.google.clientId, clientSecret: env.google.clientSecret }
    : null;

const { servicesId, teamId, keyId, privateKey, bundleId } = env.apple;

// Warn when an operator has set some but not all four Apple variables: with
// no warning, Apple silently isn't registered — no button, no log, no
// explanation of why. Skip the all-set case (the normal configured case) and
// the none-set case (the normal self-hoster-without-Apple case).
const appleVars = {
  APPLE_SERVICES_ID: servicesId,
  APPLE_TEAM_ID: teamId,
  APPLE_KEY_ID: keyId,
  APPLE_PRIVATE_KEY: privateKey,
};
const appleVarsSet = Object.values(appleVars).filter(Boolean).length;
if (appleVarsSet > 0 && appleVarsSet < 4) {
  const missing = Object.entries(appleVars)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  console.warn(
    `Sign In with Apple is disabled: missing ${missing.join(', ')}. ` +
      'Set all four of APPLE_SERVICES_ID, APPLE_TEAM_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY to enable it.',
  );
}

// Build the config in one narrowing step, so `servicesId` et al. are `string`
// below without non-null assertions. `let` because a failed mint below clears
// it back to `null`.
let appleSecret =
  servicesId && teamId && keyId && privateKey
    ? { servicesId, teamId, keyId, privateKey }
    : null;

// Mint the first client secret before the provider is constructed. Apple is
// an optional provider: if the key doesn't parse, we must not take down
// email+password/Google sign-in with it (this file has a top-level `await`, so an
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

const appleConfig = appleSecret ? { ...appleSecret, bundleId } : null;

const socialProviders = buildSocialProviders(googleConfig, appleConfig);

export const auth = betterAuth({
  baseURL: env.authUrl,
  secret: env.authSecret,
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: !env.authDevEcho,
    minPasswordLength: 8,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail(resetPasswordEmail(user.email, url));
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail(verifyEmail(user.email, url));
    },
  },
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
  databaseHooks: {
    session: {
      create: {
        // Runs on every sign-in: block disabled accounts and seed instance
        // admins from ADMIN_EMAILS (idempotent — an admin can't lock themselves
        // out because it re-promotes on each sign-in).
        before: async (session) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { email: true, isAdmin: true, disabledAt: true },
          });
          if (user?.disabledAt) {
            throw new APIError('FORBIDDEN', { message: 'This account has been disabled.' });
          }
          if (user && !user.isAdmin && env.adminEmails.includes(user.email.toLowerCase())) {
            await prisma.user.update({ where: { id: session.userId }, data: { isAdmin: true } });
          }
        },
      },
    },
  },
  plugins: [
    // Native deep-link session handoff for the Expo app: appends the session
    // cookie to the evenup:// redirect after a native OAuth callback so the
    // client can store it (without this, the app bounces back to sign-in). FR-1.5.
    expo(),
    bearer(), // token auth for the mobile app (Expo client stores it in secure storage)
    nextCookies(), // must be last
  ],
});

export type Session = typeof auth.$Infer.Session;
