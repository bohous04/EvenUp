/** Better Auth server instance (PRD §8.2): email magic link + optional Google. */
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

const socialProviders =
  env.google.clientId && env.google.clientSecret
    ? { google: { clientId: env.google.clientId, clientSecret: env.google.clientSecret } }
    : undefined;

export const auth = betterAuth({
  baseURL: env.authUrl,
  secret: env.authSecret,
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: { enabled: false },
  // Rate limiting protects auth in production (§9.2); disabled in dev/E2E so the
  // test suite's rapid repeated sign-ins aren't throttled.
  rateLimit: { enabled: !env.authDevEcho },
  // Allow the Expo app's deep-link scheme as a trusted origin (FR-1.5).
  trustedOrigins: ['evenup://'],
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
