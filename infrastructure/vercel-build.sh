#!/bin/sh
# Vercel build: compile everything, then apply pending database migrations.
#
# Preview builds only migrate once PREVIEW_DB_ISOLATED=1 confirms Preview has its own database —
# otherwise a branch push would run unreviewed migrations against the live (production) one.
set -eu

npm run build

if [ "${VERCEL_ENV:-}" = "preview" ] && [ "${PREVIEW_DB_ISOLATED:-}" != "1" ]; then
  echo "Preview build: skipping migrations until PREVIEW_DB_ISOLATED=1 (Preview must have its own database)."
  exit 0
fi

# Migrations need a direct (unpooled) connection; fall back to the pooled one.
DATABASE_URL="${DATABASE_URL_UNPOOLED:-$DATABASE_URL}" npm run db:deploy
