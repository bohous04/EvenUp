import { env } from '@/server/env';

/**
 * Universal links (docs/store/universal-links.md). Served via a
 * `next.config.mjs` rewrite at `/.well-known/apple-app-site-association`.
 * The extensionless name rules out `public/` — mime lookup by extension
 * yields `application/octet-stream`, which Apple rejects — so the route
 * handler pins `application/json` deterministically and keeps the payload
 * unit-testable. The locale middleware must never touch the path (Apple's
 * CDN fetches it verbatim).
 *
 * `appID` is composed from the same `env.apple` values Sign In with Apple
 * validation uses (production sets APPLE_TEAM_ID/APPLE_BUNDLE_ID), so the
 * file cannot drift from them; the team-id fallback keeps local dev serving
 * a well-formed file when the env var is unset. The paths mirror the screens
 * the Expo app routes to (`app/invite/[token].tsx`, `app/reset-password.tsx`).
 */
const APP_ID = `${env.apple.teamId ?? 'M7DTH7N466'}.${env.apple.bundleId}`;

const AASA = {
  applinks: {
    apps: [],
    details: [
      {
        appID: APP_ID,
        paths: ['/invite/*', '/reset-password*'],
      },
    ],
  },
};

export async function GET() {
  return Response.json(AASA);
}
