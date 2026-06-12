#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

if [ ! -f .env ]; then
  echo "Missing .env. Create it from .env.example and point DATABASE_URL at local Postgres."
  exit 1
fi

set -a
. ./.env
set +a

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is missing in .env."
  exit 1
fi

if [ -z "${AUTH_DEV_SECRET:-}" ]; then
  echo "AUTH_DEV_SECRET is missing in .env."
  exit 1
fi

psql_url="${DATABASE_URL%%\?*}"
if ! psql "$psql_url" -Atc "select 1" >/dev/null 2>&1; then
  echo "Cannot connect to local Postgres using DATABASE_URL from .env."
  exit 1
fi

busy_ports="$(
  (
    lsof -tiTCP:3200 -sTCP:LISTEN 2>/dev/null
    lsof -tiTCP:8000 -sTCP:LISTEN 2>/dev/null
  ) | sort -u || true
)"

if [ -n "$busy_ports" ]; then
  echo "Ports 3200 or 8000 are already in use. Stop the existing dev server before running this action."
  exit 1
fi

pnpm db:deploy
pnpm dev
