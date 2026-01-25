#!/bin/bash
cd /Users/stevechen/Projects/HWIS

# Kill existing processes
pkill -f "convex dev" 2>/dev/null
pkill -f "vite" 2>/dev/null
pkill -f "bun dev" 2>/dev/null
sleep 2

# Load environment
set -a
if [ -f .env.local.convex ]; then
    echo "Sourcing .env.local.convex..."
    source .env.local.convex
else
    echo "Error: .env.local.convex not found"
    exit 1
fi
set +a

# Clear any production SITE_URL that might have leaked into the shell
export SITE_URL="http://localhost:5173"

# Start Convex local backend in background
echo "Starting Convex local backend..."
# Use --dev-deployment local to ensure we use the local binary if available
bun convex dev --local --env-file .env.local.convex &
CONVEX_PID=$!

echo "Waiting for Convex to be ready (10s)..."
sleep 10

# Start Vite dev server in foreground
echo "Starting Vite dev server on port 5173..."
bun dev --port 5173