#!/bin/bash
set -e

echo "🌧 Switching to Local Development..."
echo "This will:"
echo "  ✅ Activate cloud Convex development"
echo "  ✅ Use cloud database with real operations"
echo "  ✅ Use local development server for UI testing"
echo ""

# Kill any existing local Convex
pkill -f "convex-local-backend" 2>/dev/null || true

# Update environment to local development - copy from cloud dev config
cp .env.cloud-dev .env.local

echo "🔧 Switch complete! Cloud development ready."
echo "📊 Commands:"
echo "  bun run dev  # Starts cloud backend + frontend"