#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_LOCAL="$ROOT_DIR/.env.local"
STATE_ROOT="$HOME/.convex/convex-backend-state"
BACKUP_ROOT="$HOME/.convex/backups"
TIMESTAMP="$(date +%s)"

extract_env_value() {
  local file="$1"
  local key="$2"
  local line

  if [[ ! -f "$file" ]]; then
    return 0
  fi

  line="$(grep -E "^${key}=" "$file" | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    return 0
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
}

current_deployment="$(extract_env_value "$ENV_LOCAL" "CONVEX_DEPLOYMENT")"
current_local_name=""

if [[ "$current_deployment" == local:* ]]; then
  current_local_name="${current_deployment#local:}"
fi

mkdir -p "$BACKUP_ROOT"

if [[ -n "$current_local_name" && -d "$STATE_ROOT/$current_local_name" ]]; then
  target="$BACKUP_ROOT/${current_local_name}.bak.${TIMESTAMP}"
  mv "$STATE_ROOT/$current_local_name" "$target"
  echo "Backed up current local backend state to: $target"
fi

if [[ -d "$STATE_ROOT" ]]; then
  shopt -s nullglob
  for dir in "$STATE_ROOT"/local-*; do
    base="$(basename "$dir")"
    if [[ "$base" == *.bak.* ]]; then
      mv "$dir" "$BACKUP_ROOT/$base"
      echo "Moved stale backup-named deployment out of state root: $base"
    fi
  done
  shopt -u nullglob
fi

if [[ -f "$ENV_LOCAL" ]]; then
  tmp_file="$(mktemp)"
  awk '{ if ($0 ~ /^CONVEX_DEPLOYMENT=/) { print "# " $0 } else { print $0 } }' "$ENV_LOCAL" > "$tmp_file"
  mv "$tmp_file" "$ENV_LOCAL"
  echo "Commented out CONVEX_DEPLOYMENT in .env.local to avoid stale deployment name reuse."
else
  echo "No .env.local found."
fi

cat <<'NEXT'

Next steps:
1. Recreate local deployment:
   bunx convex dev --configure existing --typecheck=disable
   - Project: hwis-31a3d
   - Deployment type: local deployment (BETA)

2. Keep that command running, then in a new terminal sync required env vars:
   bun run convex:local:env-sync

3. If users are missing in app/users after login, rebuild user profiles:
   bunx convex run recoverAuth:forceCreateUser '{"testToken":"unit-test-token"}'
NEXT
