#!/bin/bash

# Start both Convex and Vite dev servers for E2E testing
# Usage: ./scripts/start-dev-servers.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

CONvex_PID=""
VITE_PID=""

# Cleanup function to kill background processes
cleanup() {
    echo -e "${YELLOW}Shutting down servers...${NC}"
    if [ -n "$CONvex_PID" ]; then
        kill $CONvex_PID 2>/dev/null || true
        wait $CONvex_PID 2>/dev/null || true
    fi
    if [ -n "$VITE_PID" ]; then
        kill $VITE_PID 2>/dev/null || true
        wait $VITE_PID 2>/dev/null || true
    fi
    echo -e "${GREEN}Servers stopped${NC}"
    exit 0
}

# Set trap to cleanup on exit
trap cleanup EXIT INT TERM

echo -e "${GREEN}Starting Convex dev server...${NC}"

# Start Convex in background and capture output
bunx convex dev --tail-logs &
CONvex_PID=$!

# Wait for Convex to be ready (check both ports 3210 and 3211)
echo -e "${YELLOW}Waiting for Convex to be ready...${NC}"
MAX_RETRIES=60
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s http://localhost:3210 >/dev/null 2>&1 || curl -s http://localhost:3211 >/dev/null 2>&1; then
        echo -e "${GREEN}Convex is ready!${NC}"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
        echo -e "${RED}Failed to start Convex after $MAX_RETRIES attempts${NC}"
        exit 1
    fi
    sleep 1
done

echo -e "${GREEN}Starting Vite dev server...${NC}"

# Start Vite in foreground so playwright can detect when it's ready
# Vite outputs "ready in" when it's started
exec bun run dev
