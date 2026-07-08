# Self-hosting EvenUp

EvenUp is designed to run on your own infrastructure with open-source components
only — no proprietary BaaS lock-in.

## Quick start (Docker Compose)

```bash
git clone https://github.com/your-org/evenup.git
cd evenup
cp .env.example .env
# Generate and paste secrets:
#   openssl rand -base64 32   -> ENCRYPTION_KEY
#   openssl rand -base64 32   -> BETTER_AUTH_SECRET
# Set BETTER_AUTH_URL to your public URL (e.g. https://evenup.example.com)
docker compose up -d
```

This starts three services:

| Service | Purpose                                  | Port        |
| ------- | ---------------------------------------- | ----------- |
| `web`   | Next.js app (runs DB migrations on boot) | 3000        |
| `db`    | PostgreSQL 16                            | internal    |
| `minio` | S3-compatible storage for receipts       | 9000 / 9001 |

Database migrations are applied automatically when the `web` container starts
(`prisma migrate deploy`).

## Configuration

All variables are documented in [`.env.example`](../.env.example). Key ones:

- **`DATABASE_URL`** — PostgreSQL connection string.
- **`ENCRYPTION_KEY`** — 32-byte key (base64 or 64-char hex) for encrypting BYO
  OpenRouter keys and IBANs at rest (AES-256-GCM). **Keep it secret; rotating it
  invalidates stored secrets.**
- **`BETTER_AUTH_SECRET`** / **`BETTER_AUTH_URL`** — auth signing secret and the
  app's public URL.
- **`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`** — optional Google sign-in. Also
  set **`NEXT_PUBLIC_GOOGLE_ENABLED=true`** to render the button — it is inlined
  at **build** time, so it must be set before `next build` (Docker: a build arg).
- **`APPLE_*`** — optional Sign In with Apple; **required if you ship the iOS app**
  (PRD FR-1.2). Needs a paid Apple Developer Program membership. In the portal:
  1. Enable **Sign In with Apple** on the App ID `company.lnrt.evenup`.
  2. Create a **Services ID** (e.g. `company.lnrt.evenup.web`) → `APPLE_SERVICES_ID`.
     Register your domain and the return URL `https://<your-host>/api/auth/callback/apple`.
     Apple rejects `localhost` and plain `http`, so local testing needs an HTTPS tunnel.
  3. Create a **Key** with Sign In with Apple enabled. The Key ID becomes
     `APPLE_KEY_ID`; the downloaded `AuthKey_*.p8` becomes `APPLE_PRIVATE_KEY`
     (literal `\n` for newlines is fine). **The `.p8` downloads exactly once.**
  4. `APPLE_TEAM_ID` is on the membership page. `APPLE_BUNDLE_ID` defaults to
     `company.lnrt.evenup` — **that is this reference app's own bundle
     identifier, not a placeholder.** If you fork EvenUp and ship your own iOS
     app under a different bundle id, you **must** set `APPLE_BUNDLE_ID` to
     match it. Leave the default in place while shipping a different bundle id
     and native Sign In with Apple fails silently: the id_token's audience
     won't match your app, but web sign-in keeps working unaffected, because
     it validates against the separate `APPLE_SERVICES_ID` instead — so the
     mismatch is easy to miss until someone tries the native app.
  5. Set **`NEXT_PUBLIC_APPLE_ENABLED=true`** (build time) to render the button.

  EvenUp derives Apple's `client_secret` (an ES256 JWT, max ~182 days) from the
  `.p8` at runtime and re-mints it automatically. You never paste a JWT.

  > **`APPLE_PRIVATE_KEY` is a runtime secret, never a build arg.** Only the
  > `NEXT_PUBLIC_*` flags are needed at build time. Docker build args are visible
  > in the image's layer history, so passing the `.p8` as one bakes a private key
  > into every copy of your image.

  > **A bad `APPLE_PRIVATE_KEY` disables Apple sign-in, not the app.** If the
  > key can't be parsed as a PKCS8 ES256 key, EvenUp logs a line naming
  > `APPLE_PRIVATE_KEY` and simply does not register the Apple provider — the
  > app boots normally, and magic-link and Google sign-in are unaffected. The
  > symptom is the Apple button doing nothing, with requests to Apple sign-in
  > returning `404 PROVIDER_NOT_FOUND`. If that happens, check the server log
  > for the line naming `APPLE_PRIVATE_KEY`.

  > **Private-relay email.** Users who pick "Hide My Email" get an
  > `@privaterelay.appleid.com` address. Magic links and group invites sent to it
  > **bounce** unless you register your sending domain under Apple's
  > _Certificates, Identifiers & Profiles → More → Configure Email Sources_.

- **`DEFAULT_OCR_MODEL`** — default OpenRouter vision model. OCR API keys are
  **per-user (BYO)**, not a global secret.
- **`STORAGE_*`** — S3/MinIO endpoint and credentials for receipt images.
- **`RECEIPT_RETENTION_DAYS`** — days to retain the stored receipt image before
  the cleanup cron deletes it (privacy). Default `30`.
- **`CRON_SECRET`** — shared secret required by the receipt-cleanup scheduled
  task's HTTP endpoint.

## Deploying to Coolify (LNRT)

EvenUp targets [Coolify](https://coolify.io). See
[`infra/coolify/README.md`](../infra/coolify/README.md). In short:

1. Connect the GitHub repo via the Coolify GitHub App.
2. Use the Dockerfile build (`infra/docker/Dockerfile`).
3. Add the environment variables above (mark secrets as secret).
4. Attach a managed PostgreSQL (and MinIO) resource.
5. Push to `main` → Coolify builds and deploys; the post-deploy smoke test hits
   `/api/health`.

## Backups

- **Database:** schedule `pg_dump` (Coolify supports automated Postgres backups).
- **Receipts:** back up the MinIO volume, or enable per-instance auto-deletion of
  receipt images after OCR (privacy).

## Health & observability

- Health endpoint: `GET /api/health` → `{ "status": "ok", "db": "up" }`.
- Structured logs go to stdout (captured by Docker/Coolify).

## Updating

```bash
git pull
docker compose build web
docker compose up -d
```

Migrations run automatically on the new container's first boot.
