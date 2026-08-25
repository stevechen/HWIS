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

cleanup() {
	echo -e "\033[1;33mShutting down e2e servers...\033[0m" >&2
	if [ -n "$VITE_PID" ]; then
		kill "$VITE_PID" 2>/dev/null || true
		wait "$VITE_PID" 2>/dev/null || true
	fi
	if [ -n "$CONVEX_PID" ]; then
		kill "$CONVEX_PID" 2>/dev/null || true
		wait "$CONVEX_PID" 2>/dev/null || true
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
# Only pin a deployment name when one is already configured (e.g. a developer's
# .env.local). When unset (CI), `convex dev` auto-provisions an anonymous local
# backend non-interactively — required since Convex 1.44 refuses to start a
# *named* local deployment without an account login, which hangs headless CI.
export CONVEX_URL="${CONVEX_URL:-http://127.0.0.1:3210}"
export PUBLIC_CONVEX_URL="${PUBLIC_CONVEX_URL:-$CONVEX_URL}"
if [ -z "${CONVEX_DEPLOYMENT:-}" ]; then
	unset CONVEX_DEPLOYMENT
fi
unset CONVEX_AUTH_TOKEN

if curl -s http://localhost:3210 >/dev/null 2>&1 || curl -s http://localhost:3211 >/dev/null 2>&1; then
	echo -e "\033[1;32mConvex dev server already running, reusing it...\033[0m" >&2
else
		echo -e "\033[1;32mStarting Convex dev server...\033[0m" >&2
		CI=1 bunx convex dev --tail-logs --typecheck=disable >&2 &
		CONVEX_PID=$!
fi

echo -e "\033[1;33mWaiting for Convex to be ready...\033[0m" >&2
MAX_RETRIES=60
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
	if curl -s http://localhost:3210 >/dev/null 2>&1 || curl -s http://localhost:3211 >/dev/null 2>&1; then
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

if [ "${CI:-}" = "true" ] || [ "${CI:-}" = "1" ]; then
	bash scripts/convex-local-env-sync.sh >&2
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
