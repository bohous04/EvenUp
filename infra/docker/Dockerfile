# EvenUp web — multi-stage build producing a small standalone runtime image.
# Build context is the monorepo root.

# ---------- base ----------
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

# ---------- dependencies ----------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/api/package.json packages/api/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/i18n/package.json packages/i18n/package.json
# Self-contained node_modules (virtual store under node_modules/.pnpm) so it
# copies cleanly into later stages.
RUN pnpm install --frozen-lockfile

# ---------- build ----------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate the Prisma client, then build the Next standalone bundle.
RUN pnpm --filter @evenup/db exec prisma generate
# NEXT_PUBLIC_* are inlined into the client bundle by `next build`, so they must
# be present at build time — not merely in the runtime environment. Kept after
# `prisma generate` so toggling one of these flags doesn't invalidate that
# layer's cache.
ARG NEXT_PUBLIC_GOOGLE_ENABLED=""
ARG NEXT_PUBLIC_APPLE_ENABLED=""
ENV NEXT_PUBLIC_GOOGLE_ENABLED=$NEXT_PUBLIC_GOOGLE_ENABLED
ENV NEXT_PUBLIC_APPLE_ENABLED=$NEXT_PUBLIC_APPLE_ENABLED
ENV NEXT_TELEMETRY_DISABLED=1
# `next build` evaluates server modules while collecting page data under
# NODE_ENV=production, and `@/server/env` fails fast when a required secret is
# missing. Pass throwaway placeholders inline for this one command so they never
# persist as image ENV (Docker's SecretsUsedInArgOrEnv check) nor reach the runner
# stage; they are not NEXT_PUBLIC_* so they aren't inlined into the client bundle
# either. Real secrets are supplied to the runtime container's environment.
RUN ENCRYPTION_KEY=0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0 \
  BETTER_AUTH_SECRET=build-time-placeholder-not-used-at-runtime \
  pnpm --filter @evenup/web build

# ---------- runner ----------
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Copy the whole built workspace (all pnpm node_modules, the built .next, the
# generated Prisma client + engine, and source). Prisma's client + engine stay
# external in node_modules where their runtime paths resolve. This mirrors the
# locally-verified `next start` setup exactly.
COPY --from=build /app /app
RUN chmod +x /app/infra/docker/entrypoint.sh

WORKDIR /app/apps/web
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/app/infra/docker/entrypoint.sh"]
CMD ["node_modules/.bin/next", "start"]
