#!/bin/bash
set -e

echo "🏭 Switching to Local Frontend + Local Convex Development..."
echo "This will:"
echo "  ✅ Start local Convex backend"
echo "  ✅ Use local database (SQLite) for persistent testing"
echo "  ✅ Hot reload for faster iteration"
echo ""

# Kill any existing processes
pkill -f "convex-local-backend" 2>/dev/null || true
pkill -f "convex dev" 2>/dev/null || true

# Update environment to true local development
cp .env.local-dev .env.local

echo "🔧 Switch complete! Local development ready."
echo "📊 Commands:"
echo "  npx convex dev  # Starts local backend + code push"
echo "  bun run dev      # Starts frontend dev server"
echo ""
echo "After both are running, visit http://localhost:5173/test-auth"