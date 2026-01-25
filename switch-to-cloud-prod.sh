#!/bin/bash
set -e

echo "🌐 Switching to Cloud Production..."
echo "This will:"
echo "  ✅ Activate cloud Convex production"
echo "  ✅ Set environment variables for cloud backend"
echo "  ✅ Use production database with real operations"
echo ""

# Kill any existing local Convex
pkill -f "convex-local-backend" 2>/dev/null || true

# Update environment to cloud production
cp .env.cloud-prod .env.local

echo "🔧 Switch complete! Cloud production ready."
echo "📊 Commands:"
echo "  bun run dev  # Starts cloud production backend + frontend (for testing)"
echo "  bun deploy  # Deploy to production Vercel"