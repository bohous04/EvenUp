/** Centralized, validated environment access (server-only). */
import 'server-only';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Security-sensitive secrets. In production the value MUST be supplied by the
 * environment: the `devFallback` is a convenience for `pnpm dev`/tests only.
 * Falling back to a publicly-known default in production would encrypt data
 * at rest / sign sessions with a value anyone can read from the source, so we
 * fail fast instead of degrading silently.
 */
function requiredSecret(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value !== undefined && value !== '') {
    return value;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `Missing required secret ${name}. Set it in the production environment; the dev default must never be used in production.`,
    );
  }
  return devFallback;
}

export const env = {
  databaseUrl: required('DATABASE_URL', 'postgresql://evenup:evenup@localhost:5432/evenup'),
  encryptionKey: requiredSecret(
    'ENCRYPTION_KEY',
    // Dev-only fallback so `pnpm dev` works out of the box; rejected in production.
    '0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0',
  ),
  authSecret: requiredSecret(
    'BETTER_AUTH_SECRET',
    'dev-insecure-secret-change-me-please-0000000000',
  ),
  authUrl: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  /** When set, magic links are echoed to a dev endpoint for local/E2E sign-in. */
  authDevEcho: process.env.AUTH_DEV_ECHO === 'true',
  /**
   * Comma-separated emails auto-promoted to instance admin on sign-in. Admins
   * can then grant admin/VIP to others in the dashboard. Lower-cased for a
   * case-insensitive match; empty when unset (no auto-admins).
   */
  adminEmails: (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  },
  /**
   * Sign In with Apple. `servicesId` is the Services ID (the *web* OAuth client
   * id); `bundleId` is the iOS App ID, used only to validate native id_tokens.
   * They are different identifiers and are not interchangeable.
   */
  apple: {
    servicesId: process.env.APPLE_SERVICES_ID,
    bundleId: process.env.APPLE_BUNDLE_ID ?? 'company.lnrt.evenup',
    teamId: process.env.APPLE_TEAM_ID,
    keyId: process.env.APPLE_KEY_ID,
    privateKey: process.env.APPLE_PRIVATE_KEY,
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
  storage: {
    endpoint: process.env.STORAGE_ENDPOINT,
    region: process.env.STORAGE_REGION ?? 'us-east-1',
    accessKey: process.env.STORAGE_ACCESS_KEY,
    secretKey: process.env.STORAGE_SECRET_KEY,
    bucket: process.env.STORAGE_BUCKET ?? 'evenup-receipts',
  },
  // Days to retain the stored receipt image before the cleanup cron deletes it (privacy).
  // A malformed value (e.g. "" or "abc") parses to NaN, which would crash the
  // cleanup query, so fall back to the default instead.
  receiptRetentionDays: (() => {
    const n = Number.parseInt(process.env.RECEIPT_RETENTION_DAYS ?? '30', 10);
    return Number.isFinite(n) ? n : 30;
  })(),
  // Shared secret required by the receipt-cleanup scheduled task's HTTP endpoint.
  cronSecret: process.env.CRON_SECRET,
  fxProviderUrl: process.env.FX_PROVIDER_URL ?? 'https://api.frankfurter.app',
};
