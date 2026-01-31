#!/bin/bash
cd /Users/stevechen/Projects/HWIS

echo "🚀 Local Convex Development"
echo "========================="

# Kill everything first
pkill -f "convex" 2>/dev/null
pkill -f "vite" 2>/dev/null
pkill -f "bun dev" 2>/dev/null
sleep 3

# Setup environment (exact sequence you used before)
source .env.local.convex
export CONVEX_DEPLOYMENT=
export PUBLIC_CONVEX_URL=http://localhost:3217
export CONVEX_URL=http://localhost:3217
export SITE_URL=http://localhost:5173

echo "✅ Environment configured"
echo "🔧 Starting Convex (your working command)..."
echo "   CONVEX_DEPLOYMENT= bun convex dev --local --typecheck=disable"

# Your exact working command sequence
CONVEX_DEPLOYMENT= bun convex dev --local --typecheck=disable &
sleep 25

echo "⏳ Checking Convex status..."
if curl -s http://localhost:3217/ > /dev/null; then
    echo "✅ Convex is RUNNING!"
    echo "🌐 Convex URL: http://localhost:3217"
    echo ""
    echo "🎯 Starting Vite dev server..."
    bun dev --port 5173
else
    echo "❌ Convex not responding"
    echo "💡 Try running the command manually in a fresh terminal"
fi