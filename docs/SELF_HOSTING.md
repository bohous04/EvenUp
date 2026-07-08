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
- **`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`** — optional Google sign-in.
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
