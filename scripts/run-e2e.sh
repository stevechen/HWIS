#!/bin/bash
#
# Run the Playwright e2e suite with locally managed Convex + Vite servers.
#
# Unlike playwright.config.ts's webServer (which with reuseExistingServer reuses a
# stale server and silently skips the Convex bootstrap, causing the app to hang on
# hydration), this script owns the full server lifecycle:
#   1. free the Vite port
#   2. start (or reuse) a local Convex dev server
#   3. start a Vite dev server on 5173
#   4. run `playwright test --config playwright.e2e.config.ts`
#   5. tear everything down
#
# The Vite port must be 5173: the dev auth stack hardcodes
# http://localhost:5173 as its base URL / trusted origin (src/lib/auth-client.ts,
# src/convex/auth.ts, the auth +server.ts, etc.), so any other port breaks auth.
#
# All status output goes to stderr so `test:ai` (which pipes stdout through a
# JSON compressor) receives only Playwright's JSON report.

set -e

VITE_PORT="${VITE_PORT:-5173}"
VITE_PID=""
CONVEX_PID=""
CONVEX_STARTED="0"

convex_ready() {
	curl -s --max-time 2 http://localhost:3210 >/dev/null 2>&1 &&
		curl -s --max-time 2 http://localhost:3211 >/dev/null 2>&1
}

stop_owned_convex() {
	if [ -n "$CONVEX_PID" ]; then
		kill "$CONVEX_PID" 2>/dev/null || true
		wait "$CONVEX_PID" 2>/dev/null || true
	fi

	# `convex dev` owns a separate local-backend child process. Kill that child
	# too, otherwise a restart can pass the port check while the old process is
	# still serving functions with stale environment variables.
	local backend_pids
	backend_pids="$(lsof -ti tcp:3210 -sTCP:LISTEN 2>/dev/null || true)"
	if [ -n "$backend_pids" ]; then
		kill $backend_pids 2>/dev/null || true
	fi
	CONVEX_PID=""
}

cleanup() {
	echo -e "\033[1;33mShutting down e2e servers...\033[0m" >&2
	if [ -n "$VITE_PID" ]; then
		kill "$VITE_PID" 2>/dev/null || true
		wait "$VITE_PID" 2>/dev/null || true
	fi
	if [ "$CONVEX_STARTED" = "1" ]; then
		stop_owned_convex
	fi
	echo -e "\033[1;32me2e servers stopped\033[0m" >&2
}
trap cleanup EXIT INT TERM

# Free the port so the dev server can bind with --strictPort.
# Whatever was there (a plain dev server, a stale process) must go.
if lsof -ti "tcp:${VITE_PORT}" >/dev/null 2>&1; then
	echo -e "\033[1;33mPort ${VITE_PORT} in use; freeing it...\033[0m" >&2
	lsof -ti "tcp:${VITE_PORT}" | xargs kill 2>/dev/null || true
	sleep 1
fi

# Force local Convex for the run (same as scripts/start-dev-servers.sh).
export CONVEX_URL="${CONVEX_URL:-http://127.0.0.1:3210}"
export PUBLIC_CONVEX_URL="${PUBLIC_CONVEX_URL:-$CONVEX_URL}"
# Convex and Vite run as separate processes, so provide the same local auth
# configuration to both instead of letting each generate its own secret.
export SITE_URL="${SITE_URL:-http://localhost:${VITE_PORT}}"
export VITE_SITE_URL="${VITE_SITE_URL:-$SITE_URL}"
export PUBLIC_SITE_URL="${PUBLIC_SITE_URL:-$SITE_URL}"
export BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-e2e-local-better-auth-secret-change-me}"
# Leave deployment selection unset so non-interactive CI uses Convex's
# anonymous local deployment instead of prompting for account login.
unset CONVEX_DEPLOYMENT
unset CONVEX_AUTH_TOKEN

if convex_ready; then
	echo -e "\033[1;32mConvex dev server already running, reusing it...\033[0m" >&2
else
		echo -e "\033[1;32mStarting Convex dev server...\033[0m" >&2
		CI=1 bunx convex dev --tail-logs --typecheck=disable >&2 &
		CONVEX_PID=$!
		CONVEX_STARTED="1"
fi

echo -e "\033[1;33mWaiting for Convex to be ready...\033[0m" >&2
MAX_RETRIES=60
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
	if convex_ready; then
		echo -e "\033[1;32mConvex is ready!\033[0m" >&2
		break
	fi
	RETRY_COUNT=$((RETRY_COUNT + 1))
	if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
		echo -e "\033[1;31mFailed to start Convex after $MAX_RETRIES attempts\033[0m" >&2
		exit 1
	fi
	sleep 1
done

# Auth configuration is read inside Convex functions, so shell exports alone
# are insufficient. Set the values on the anonymous local deployment after it
# has been created and before the frontend requests a JWT.
printf '%s' "$BETTER_AUTH_SECRET" | bunx convex env set --deployment local BETTER_AUTH_SECRET >/dev/null
bunx convex env set --deployment local SITE_URL "$SITE_URL" >/dev/null

# The first Convex process can load function modules before the deployment
# environment is updated. Restart the process we started so auth reads the
# configured secret on module initialization. Never restart a server owned by
# the caller when this script reused an existing one.
if [ -n "$CONVEX_PID" ]; then
	echo -e "\033[1;33mRestarting Convex after setting auth environment...\033[0m" >&2
	stop_owned_convex
	CI=1 bunx convex dev --tail-logs --typecheck=disable >&2 &
	CONVEX_PID=$!

	RETRY_COUNT=0
	while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
		if convex_ready; then
			echo -e "\033[1;32mConvex is ready with auth environment configured!\033[0m" >&2
			break
		fi
		RETRY_COUNT=$((RETRY_COUNT + 1))
		if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
			echo -e "\033[1;31mFailed to restart Convex after $MAX_RETRIES attempts\033[0m" >&2
			exit 1
		fi
		sleep 1
	done
fi

echo -e "\033[1;32mStarting Vite dev server on port ${VITE_PORT}...\033[0m" >&2
bun run dev -- --port "${VITE_PORT}" --strictPort >&2 &
VITE_PID=$!

echo -e "\033[1;33mWaiting for Vite to be ready...\033[0m" >&2
MAX_RETRIES=120
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
	if curl -s "http://localhost:${VITE_PORT}" >/dev/null 2>&1; then
		echo -e "\033[1;32mVite is ready!\033[0m" >&2
		break
	fi
	RETRY_COUNT=$((RETRY_COUNT + 1))
	if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
		echo -e "\033[1;31mFailed to start Vite after $MAX_RETRIES attempts\033[0m" >&2
		exit 1
	fi
	sleep 1
done

# Run the suite. Servers are already up, and playwright.e2e.config.ts has no
# webServer, so Playwright won't try to manage (or reuse) them.
echo -e "\033[1;32mRunning Playwright e2e suite...\033[0m" >&2
bunx playwright test --config playwright.e2e.config.ts "$@"
