#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_LOCAL="$ROOT_DIR/.env.local"
ENV_DEFAULT="$ROOT_DIR/.env"

read_env_value() {
  local key="$1"
  local file
  local line

  for file in "$ENV_LOCAL" "$ENV_DEFAULT"; do
    if [[ ! -f "$file" ]]; then
      continue
    fi

    line="$(grep -E "^${key}=" "$file" | tail -n 1 || true)"
    if [[ -z "$line" ]]; then
      continue
    fi

    line="${line#${key}=}"
    line="${line%%#*}"
    line="$(printf '%s' "$line" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"

    if [[ "$line" =~ ^".*"$ ]]; then
      line="${line:1:${#line}-2}"
    elif [[ "$line" =~ ^\'.*\'$ ]]; then
      line="${line:1:${#line}-2}"
    fi

    printf '%s' "$line"
    return 0
  done

  return 0
}

if ! curl -sSf http://127.0.0.1:3210 >/dev/null 2>&1; then
  echo "Local Convex backend is not reachable at http://127.0.0.1:3210"
  echo "Run 'bunx convex dev --typecheck=disable' first, then rerun this script."
  exit 1
fi

SITE_URL_VALUE="$(read_env_value SITE_URL)"
if [[ -z "$SITE_URL_VALUE" ]]; then
  SITE_URL_VALUE="$(read_env_value VITE_SITE_URL)"
fi
if [[ -z "$SITE_URL_VALUE" ]]; then
  SITE_URL_VALUE="http://localhost:5173"
fi

BETTER_AUTH_SECRET_VALUE="$(read_env_value BETTER_AUTH_SECRET)"
GOOGLE_CLIENT_ID_VALUE="$(read_env_value GOOGLE_CLIENT_ID)"
GOOGLE_CLIENT_SECRET_VALUE="$(read_env_value GOOGLE_CLIENT_SECRET)"

set_kv() {
  local key="$1"
  local value="$2"

  if [[ -z "$value" ]]; then
    echo "Skipping $key (not found in .env.local or .env)"
    return 0
  fi

  bunx convex env set "$key" "$value" >/dev/null
  echo "Set $key"
}

echo "Syncing local Convex deployment env vars..."
set_kv SITE_URL "$SITE_URL_VALUE"
set_kv BETTER_AUTH_SECRET "$BETTER_AUTH_SECRET_VALUE"
set_kv GOOGLE_CLIENT_ID "$GOOGLE_CLIENT_ID_VALUE"
set_kv GOOGLE_CLIENT_SECRET "$GOOGLE_CLIENT_SECRET_VALUE"

echo "Done."
