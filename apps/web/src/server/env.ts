/** Centralized, validated environment access (server-only). */
import 'server-only';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  databaseUrl: required('DATABASE_URL', 'postgresql://evenup:evenup@localhost:5432/evenup'),
  encryptionKey: required(
    'ENCRYPTION_KEY',
    // Dev-only fallback so `pnpm dev` works out of the box; override in production.
    '0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0',
  ),
  authSecret: required('BETTER_AUTH_SECRET', 'dev-insecure-secret-change-me-please-0000000000'),
  authUrl: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  /** When set, magic links are echoed to a dev endpoint for local/E2E sign-in. */
  authDevEcho: process.env.AUTH_DEV_ECHO === 'true',
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  },
  email: {
    from: process.env.EMAIL_FROM ?? 'EvenUp <onboarding@resend.dev>',
    resendApiKey: process.env.RESEND_API_KEY,
    smtp: {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? '587'),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  },
};
