#!/bin/sh
set -e

# Apply database migrations before starting the server (PRD §11.2). Safe to run
# on every boot — `migrate deploy` only applies pending migrations.
if [ -n "$DATABASE_URL" ]; then
  echo "Running database migrations..."
  (cd /app && pnpm --filter @evenup/db exec prisma migrate deploy) || {
    echo "Migration failed" >&2
    exit 1
  }
fi

exec "$@"
