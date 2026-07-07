# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security vulnerabilities. Instead, use
GitHub's private vulnerability reporting ("Report a vulnerability" under the
Security tab) or email the maintainers. We aim to acknowledge within 72 hours.

## What we protect

- **Secrets at rest** — BYO OpenRouter API keys and member IBANs are encrypted
  with **AES-256-GCM** (`ENCRYPTION_KEY`, server-managed). They are never
  returned to clients after saving and never logged.
- **Sessions** — httpOnly, SameSite cookies on web; secure token storage on
  mobile.
- **Input validation** — all API inputs are validated server-side with zod;
  database access is parameterized via Prisma.
- **No money movement** — EvenUp never processes payments; it only generates QR
  payment requests and records that a settlement happened.

## Hardening checklist for self-hosters

- Set a strong, unique `ENCRYPTION_KEY` and `BETTER_AUTH_SECRET`
  (`openssl rand -base64 32`). Rotate if leaked.
- Serve over HTTPS only (Coolify/Traefik + Let's Encrypt handles this).
- Restrict database and MinIO network exposure to the app.
- Enable automated database backups.
- Keep dependencies updated (Renovate/Dependabot).

## Supported versions

Security fixes target the latest released version on `main`.
