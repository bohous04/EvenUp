# EvenUp — _dlužníček_ ⚖️

> Open-source, self-hostable app for splitting group expenses and **minimizing
> the number of debts** between people. Web first, with iOS + Android apps.
> Free, no ads, no monetization. **MIT licensed.**

[![CI](https://github.com/your-org/evenup/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/evenup/actions/workflows/ci.yml)
&nbsp;Languages: **Čeština** (default) + **English**

🇨🇿 _Otevřená, self-hostovatelná aplikace pro dělení společných výdajů, která
**minimalizuje počet dluhů** mezi lidmi. Nejdřív web, pak plnohodnotné iOS a
Android aplikace. Zdarma, bez reklam._

---

## What it does

- **Groups & members** — create a group (trip, flat, event), add people in
  seconds. Members are **virtual** (name + color + initials, no account needed)
  or linked to optional accounts via invite links.
- **Expenses, income, transfers** — one or more payers; split **equally / by
  exact amounts / by shares / by percentage / itemized**. Cent-accurate rounding
  (largest-remainder), no floating-point drift.
- **Debt minimization** — always shows the _minimal_ set of settlement payments
  via greedy min-cash-flow netting. If `A → B → C` for equal amounts, it
  collapses to `A → C`.
- **OCR receipts** — photograph a receipt → structured line items (via
  OpenRouter, **your own API key**, encrypted at rest) → assign each item to
  people by tapping **colored initial chips**. Manual entry is always available.
- **SPAYD QR ("QR Platba")** — generate a Czech bank-transfer QR for a
  suggested payment, then mark it settled.
- **Multi-currency** with daily FX rates (override + per-trip lock).
- **Bilingual** CZ/EN, accessible (WCAG 2.1 AA), installable PWA.

See [`docs/PRD.md`](docs/PRD.md) for the full product spec.

## Tech stack

TypeScript everywhere, in a pnpm + Turborepo monorepo:

| Package         | What                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `packages/core` | **Pure** domain logic: split math, debt minimization, FX, SPAYD. Integer minor units, no floats. Single source of truth. |
| `packages/api`  | tRPC routers + zod validation, encryption (AES-GCM), OCR adapter.                                                        |
| `packages/db`   | Prisma schema + migrations + seed (PostgreSQL).                                                                          |
| `packages/i18n` | CZ/EN message catalogs + locale-aware formatting.                                                                        |
| `apps/web`      | Next.js (App Router) + PWA, Better Auth, Tailwind.                                                                       |
| `apps/mobile`   | Expo / React Native (iOS + Android).                                                                                     |

## Quickstart (development)

```bash
pnpm install
cp .env.example .env            # fill ENCRYPTION_KEY + BETTER_AUTH_SECRET
docker compose up -d db         # or point DATABASE_URL at your own Postgres
pnpm --filter @evenup/db exec prisma migrate deploy
pnpm --filter @evenup/db seed   # optional demo data
pnpm dev                        # web at http://localhost:3000
```

Generate secrets: `openssl rand -base64 32`.

## Self-hosting

A single command brings up web + PostgreSQL + MinIO:

```bash
cp .env.example .env            # set ENCRYPTION_KEY, BETTER_AUTH_SECRET, BETTER_AUTH_URL
docker compose up -d
```

Migrations run automatically on container start. See
[`docs/SELF_HOSTING.md`](docs/SELF_HOSTING.md) for the full guide.

## Testing

```bash
pnpm test                       # unit + integration (needs DATABASE_URL for api)
pnpm --filter @evenup/core test:coverage   # >= 95% gate on the core math
pnpm --filter @evenup/web test:e2e         # Playwright E2E + axe a11y
```

- **`packages/core`** is verified exhaustively with unit + **property-based
  tests (fast-check)**: every split type, the largest-remainder residual rule,
  debt minimization (`≤ n−1` payments, settles to zero), FX, and SPAYD.
- **Integration tests** run tRPC + Prisma against an ephemeral Postgres.
- **Playwright** covers the critical web journeys with visual + a11y checks; the
  OCR adapter is tested against **recorded fixtures** (no live API calls in CI).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). By participating you agree to the
[Code of Conduct](CODE_OF_CONDUCT.md). Security issues:
[`SECURITY.md`](SECURITY.md).

## License

[MIT](LICENSE) © EvenUp contributors.
