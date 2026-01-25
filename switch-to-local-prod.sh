#!/bin/bash
set -e

echo "🏭 Switching to Local Production..."
echo "This will:"
echo "  ✅ Activate local Convex production backend"
echo "  ✅ Use local production database (SQLite) for production-like testing"
echo "  ✅ Hot reload for faster iteration"
echo ""

# Kill any existing local Convex processes
pkill -f "convex-local-backend" 2>/dev/null || true

# Update environment to local production
cp .env.local-prod .env.local

echo "🔧 Switch complete! Local production ready."
echo "📊 Commands:"
echo " ./start-local-convex-prod.sh && bun run dev  # Starts local production backend + frontend"