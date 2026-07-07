# Contributing to EvenUp

Thanks for helping! EvenUp is open source (MIT) and contributions are welcome.

## Ground rules

- Be kind. See the [Code of Conduct](CODE_OF_CONDUCT.md).
- **Everything ships tested.** A change is "done" only when code + tests are
  green in CI, coverage gates pass, CZ+EN strings exist for any new UI, and a11y
  checks pass (see PRD §10.3).
- The financial math lives in **`packages/core`** and is the single source of
  truth. Keep it pure, float-free (integer minor units), and covered ≥ 95%.

## Development setup

```bash
pnpm install
cp .env.example .env
docker compose up -d db
pnpm --filter @evenup/db exec prisma migrate deploy
pnpm dev
```

## Workflow

1. Branch off `main`.
2. **Write a failing test first** (TDD), then make it pass.
3. Run locally before pushing:
   ```bash
   pnpm format && pnpm lint && pnpm typecheck && pnpm test
   ```
4. Use [Conventional Commits](https://www.conventionalcommits.org/)
   (`feat:`, `fix:`, `docs:`, `test:`, `chore:` …).
5. Add a Changeset for user-facing changes: `pnpm changeset`.
6. Open a PR. All required CI jobs must be green; branch protection enforces it.

## Project layout

See the table in the [README](README.md#tech-stack). Shared math goes in
`packages/core`; never duplicate it in `apps/*`.

## Tests

- Unit + property-based (fast-check) for `packages/core`.
- Integration (tRPC + Prisma vs. ephemeral Postgres) for `packages/api`.
- Playwright E2E + axe for `apps/web`; Maestro for `apps/mobile`.
- OCR is tested against recorded fixtures — **never** make live OpenRouter calls
  in tests.
