#!/bin/bash
#
# Run the Playwright e2e suite against an instrumented Vite dev server so that
# browser-side Istanbul coverage is collected (VITE_COVERAGE=true).
#
# Playwright's own webServer refuses to start when the port is occupied
# (reuseExistingServer:false) and that check runs before the command executes,
# so we manage the server lifecycle here instead:
#   1. free the Vite port
#   2. start an instrumented Vite dev server on it
#   3. run `playwright test --config playwright.coverage.config.ts`
#   4. tear the server down
#
# The Vite port must be 5173: the dev auth stack hardcodes
# http://localhost:5173 as its base URL / trusted origin (auth-client.ts,
# src/convex/auth.ts, the auth +server.ts), so any other port breaks auth.

set -e

VITE_PORT="${VITE_PORT:-5173}"
VITE_PID=""
CONVEX_PID=""

cleanup() {
    echo -e "\033[1;33mShutting down coverage e2e servers...\033[0m"
    if [ -n "$VITE_PID" ]; then
        kill "$VITE_PID" 2>/dev/null || true
        wait "$VITE_PID" 2>/dev/null || true
    fi
    if [ -n "$CONVEX_PID" ]; then
        kill "$CONVEX_PID" 2>/dev/null || true
        wait "$CONVEX_PID" 2>/dev/null || true
    fi
    echo -e "\033[1;32mCoverage e2e servers stopped\033[0m"
    exit 0
}
trap cleanup EXIT INT TERM

# Free the port so the instrumented server can bind with --strictPort.
# Whatever was there (a plain dev server, a stale process) must go: coverage
# requires the instrumented instance.
if lsof -ti "tcp:${VITE_PORT}" >/dev/null 2>&1; then
    echo -e "\033[1;33mPort ${VITE_PORT} in use; freeing it...\033[0m"
    lsof -ti "tcp:${VITE_PORT}" | xargs kill 2>/dev/null || true
    sleep 1
fi

# Force local Convex for the run (same as scripts/start-dev-servers.sh).
export CONVEX_URL="${CONVEX_URL:-http://127.0.0.1:3210}"
export PUBLIC_CONVEX_URL="${PUBLIC_CONVEX_URL:-$CONVEX_URL}"
if [ -z "${CONVEX_DEPLOYMENT:-}" ]; then
    unset CONVEX_DEPLOYMENT
fi
unset CONVEX_AUTH_TOKEN

if curl -s http://localhost:3210 >/dev/null 2>&1 || curl -s http://localhost:3211 >/dev/null 2>&1; then
    echo -e "\033[1;33mConvex dev server already running, reusing it...\033[0m"
else
    echo -e "\033[1;32mStarting Convex dev server...\033[0m"
    CI=1 bunx convex dev --tail-logs --typecheck=disable &
    CONVEX_PID=$!
fi

echo -e "\033[1;33mWaiting for Convex to be ready...\033[0m"
MAX_RETRIES=60
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s http://localhost:3210 >/dev/null 2>&1 || curl -s http://localhost:3211 >/dev/null 2>&1; then
        echo -e "\033[1;32mConvex is ready!\033[0m"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
        echo -e "\033[1;31mFailed to start Convex after $MAX_RETRIES attempts\033[0m"
        exit 1
    fi
    sleep 1
done

if [ "${CI:-}" = "true" ] || [ "${CI:-}" = "1" ]; then
    bash scripts/convex-local-env-sync.sh
fi

echo -e "\033[1;32mStarting instrumented Vite dev server on port ${VITE_PORT}...\033[0m"
VITE_COVERAGE=true bun run dev -- --port "${VITE_PORT}" --strictPort &
VITE_PID=$!

echo -e "\033[1;33mWaiting for Vite to be ready...\033[0m"
MAX_RETRIES=120
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s "http://localhost:${VITE_PORT}" >/dev/null 2>&1; then
        echo -e "\033[1;32mVite is ready!\033[0m"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
        echo -e "\033[1;31mFailed to start Vite after $MAX_RETRIES attempts\033[0m"
        exit 1
    fi
    sleep 1
done

# Run the suite. VITE_COVERAGE must be visible to the Playwright process so
# the coverage fixture (e2e/fixtures.ts) collects window.__coverage__.
echo -e "\033[1;32mRunning Playwright e2e suite (instrumented)...\033[0m"
VITE_COVERAGE=true bunx playwright test --config playwright.coverage.config.ts "$@"
