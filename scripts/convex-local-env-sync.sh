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
CRON_SECRET_VALUE="$(read_env_value CRON_SECRET)"
# Drive backup vars are read from LOCAL_-prefixed keys, never from the shared
# GOOGLE_* ones. The Drive OAuth credentials and the backup folder are a
# production resource: syncing them here is what used to let a local cron run
# write a same-name duplicate into the production backup folder. See
# docs/drive-backup-targets.md.
GOOGLE_DRIVE_FOLDER_ID_VALUE="$(read_env_value LOCAL_GOOGLE_DRIVE_FOLDER_ID)"
ALLOW_NONPROD_DRIVE_BACKUP_VALUE="$(read_env_value ALLOW_NONPROD_DRIVE_BACKUP)"

# A local deployment is never prod, so the Drive upload is off unless the
# operator opted in *and* named a folder this deployment owns.
if [[ -n "$ALLOW_NONPROD_DRIVE_BACKUP_VALUE" && "$ALLOW_NONPROD_DRIVE_BACKUP_VALUE" != "true" ]]; then
  echo "ALLOW_NONPROD_DRIVE_BACKUP must be exactly 'true' (got '$ALLOW_NONPROD_DRIVE_BACKUP_VALUE'); ignoring it"
  ALLOW_NONPROD_DRIVE_BACKUP_VALUE=""
fi
if [[ -n "$ALLOW_NONPROD_DRIVE_BACKUP_VALUE" && -z "$GOOGLE_DRIVE_FOLDER_ID_VALUE" ]]; then
  echo "ALLOW_NONPROD_DRIVE_BACKUP=true but LOCAL_GOOGLE_DRIVE_FOLDER_ID is unset; the upload will be skipped"
  ALLOW_NONPROD_DRIVE_BACKUP_VALUE=""
fi

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
set_kv CRON_SECRET "$CRON_SECRET_VALUE"
set_kv GOOGLE_DRIVE_FOLDER_ID "$GOOGLE_DRIVE_FOLDER_ID_VALUE"
set_kv ALLOW_NONPROD_DRIVE_BACKUP "$ALLOW_NONPROD_DRIVE_BACKUP_VALUE"

echo "Done."
echo "Note: GOOGLE_REFRESH_TOKEN is deliberately not synced. The Drive upload is"
echo "skipped on a local deployment unless ALLOW_NONPROD_DRIVE_BACKUP=true and"
echo "LOCAL_GOOGLE_DRIVE_FOLDER_ID names a scratch folder. See docs/drive-backup-targets.md."
