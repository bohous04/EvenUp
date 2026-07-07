# Deploying EvenUp to LNRT Coolify

EvenUp's production target is a self-hosted [Coolify](https://coolify.io)
instance (LNRT). Two ways to deploy, both supported:

## A) Coolify GitHub App (recommended)

1. In Coolify, create a new **Application** from this GitHub repository (install
   the Coolify GitHub App on the repo if needed).
2. **Build pack:** Dockerfile. **Dockerfile path:** `infra/docker/Dockerfile`.
   **Build context:** repository root.
3. **Port:** `3000`. **Health check path:** `/api/health`.
4. Add environment variables (see [`.env.example`](../../.env.example)); mark
   `ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`, and provider secrets as **Secret**.
5. Attach managed **PostgreSQL** (and optionally **MinIO**) resources and wire
   `DATABASE_URL` / `STORAGE_*`.
6. Enable **auto-deploy on push to `main`**.

On every push to `main`, Coolify rebuilds the image and redeploys. The container
runs `prisma migrate deploy` on boot, so schema changes apply automatically.

## B) Webhook trigger from CI

If you prefer triggering from GitHub Actions, set repository secrets:

- `COOLIFY_WEBHOOK` — the Coolify deploy webhook URL for the app.
- `COOLIFY_TOKEN` — a Coolify API token (Bearer).
- `DEPLOY_URL` — the public app URL, used for the post-deploy smoke test.

The [`deploy.yml`](../../.github/workflows/deploy.yml) workflow builds and pushes
the image to GHCR, calls the webhook, then smoke-tests `/api/health`.

## TLS & domains

Coolify (Traefik + Let's Encrypt) terminates HTTPS. Point your domain at the
Coolify server and set `BETTER_AUTH_URL` to the `https://` URL so auth cookies
and magic-link callbacks use the correct origin.

## Preview deploys

Per-PR preview environments can be enabled in Coolify where the server has
capacity; otherwise rely on the CI `e2e-web` job for PR verification.
